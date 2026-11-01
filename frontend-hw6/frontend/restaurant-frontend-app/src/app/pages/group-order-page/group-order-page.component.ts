import { CurrencyPipe, DatePipe } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { EMPTY, Observable, Subscription, catchError, exhaustMap, finalize, forkJoin, interval, map, switchMap, tap } from 'rxjs';
import { GroupReservationStatus } from '@app/models/group-orders/group-status.model';
import { Participant } from '@app/models/group-orders/participant.model';
import { GuestInvite } from '@app/models/reservations/guest-invite.model';
import { ParticipantCardComponent } from '@app/components/group-orders/participant-card/participant-card.component';
import { GroupOrdersService } from '@app/services/group-orders/group-orders.service';
import { ToastService } from '@app/services/toast/toast.service';
import { consolidatePreOrder } from '@app/shared/helpers/consolidate-pre-order';
import { ModalComponent } from '@app/shared/custom-components/modal/modal.component';

const SYNC_INTERVAL_MS = 15_000;

type ScreenError = 'not-found' | 'failed';

@Component({
  selector: 'app-group-order-page',
  imports: [ParticipantCardComponent, ModalComponent, CurrencyPipe, DatePipe],
  templateUrl: './group-order-page.component.html',
  styleUrl: './group-order-page.component.scss',
  changeDetection: ChangeDetectionStrategy.Eager,
})
export class GroupOrderPageComponent {
  private readonly service = inject(GroupOrdersService);
  private readonly toast = inject(ToastService);

  private readonly reservationId = inject(ActivatedRoute).snapshot.paramMap.get('reservationId') ?? '';
  private syncSubscription: Subscription | null = null;
  private syncInFlight = false;

  readonly loading = signal(true);
  readonly error = signal<ScreenError | null>(null);
  readonly invite = signal<GuestInvite | null>(null);
  readonly participants = signal<Participant[]>([]);
  readonly ownerSessionId = signal('');
  readonly status = signal<GroupReservationStatus>('Open');

  readonly updatedAt = signal<Date | null>(null);
  readonly syncFailed = signal(false);

  readonly submitting = signal(false);
  readonly submitDialogOpen = signal(false);
  readonly removing = signal(false);
  readonly participantToRemove = signal<Participant | null>(null);

  readonly consolidated = computed(() => consolidatePreOrder(this.participants()));
  readonly pendingCount = computed(() => this.participants().filter((person) => !person.isSubmitted).length);
  readonly hasAnyDishes = computed(() => this.participants().some((person) => person.items.length > 0));
  readonly isOpen = computed(() => this.status() === 'Open');
  readonly canSubmit = computed(
    () => this.isOpen() && !this.submitting() && this.consolidated().items.length > 0,
  );

  constructor() {
    inject(DestroyRef).onDestroy(() => this.stopSync());
    this.load();
  }

  load(): void {
    this.stopSync();
    this.loading.set(true);
    this.error.set(null);

    this.service
      .getGroupInvite$(this.reservationId)
      .pipe(
        switchMap((invite) =>
          forkJoin({
            sessions: this.service.getSessions$(invite.GroupReservationId),
            ownerSessionId: this.service.getOwnerSessionId$(this.reservationId),
            status: this.service.getStatus$(invite.GroupReservationId),
          }).pipe(map((data) => ({ invite, ...data }))),
        ),
      )
      .subscribe({
        next: ({ invite, sessions, ownerSessionId, status }) => {
          this.invite.set(invite);
          this.participants.set(sessions.participants);
          this.ownerSessionId.set(ownerSessionId);
          this.status.set(status.status);
          this.markSynced();
          this.loading.set(false);
          this.startSync();
        },
        error: (error: HttpErrorResponse) => {
          this.error.set(error.status === 404 ? 'not-found' : 'failed');
          this.loading.set(false);
        },
      });
  }

  refresh(): void {
    if (this.syncInFlight) {
      return;
    }
    this.syncOnce$().subscribe();
  }

  openSubmitDialog(): void {
    if (this.canSubmit()) {
      this.submitDialogOpen.set(true);
    }
  }

  closeSubmitDialog(): void {
    if (!this.submitting()) {
      this.submitDialogOpen.set(false);
    }
  }

  confirmSubmit(): void {
    const groupId = this.invite()?.GroupReservationId;
    if (!groupId || this.submitting()) {
      return;
    }

    this.submitting.set(true);
    this.service
      .submit$(groupId, this.reservationId)
      .pipe(finalize(() => this.submitting.set(false)))
      .subscribe({
        next: () => {
          this.submitDialogOpen.set(false);
          this.status.set('Submitted');
          this.stopSync();
          this.toast.success('Pre-order sent to the restaurant');
        },
        // toast з помилкою вже показує tokenInterceptor
        error: () => this.submitDialogOpen.set(false),
      });
  }

  askRemove(person: Participant): void {
    this.participantToRemove.set(person);
  }

  cancelRemove(): void {
    if (!this.removing()) {
      this.participantToRemove.set(null);
    }
  }

  confirmRemove(): void {
    const person = this.participantToRemove();
    const groupId = this.invite()?.GroupReservationId;
    if (!person || !groupId || this.removing()) {
      return;
    }

    this.removing.set(true);
    this.service
      .removeSession$(groupId, person.id)
      .pipe(finalize(() => this.removing.set(false)))
      .subscribe({
        next: (response) => {
          this.participants.set(response.participants);
          this.participantToRemove.set(null);
        },
        error: () => this.participantToRemove.set(null),
      });
  }

  canRemove(person: Participant): boolean {
    return this.isOpen() && person.type === 'Guest';
  }

  /** Один таймер на сторінку; новий запит не стартує, поки попередній не відповів. */
  private startSync(): void {
    this.stopSync();
    if (!this.isOpen()) {
      return;
    }
    this.syncSubscription = interval(SYNC_INTERVAL_MS)
      .pipe(exhaustMap(() => (this.syncInFlight ? EMPTY : this.syncOnce$())))
      .subscribe();
  }

  private stopSync(): void {
    this.syncSubscription?.unsubscribe();
    this.syncSubscription = null;
  }

  private syncOnce$(): Observable<unknown> {
    const groupId = this.invite()?.GroupReservationId;
    if (!groupId) {
      return EMPTY;
    }

    this.syncInFlight = true;
    return forkJoin({
      sessions: this.service.getSessions$(groupId, { silent: true }),
      status: this.service.getStatus$(groupId, { silent: true }),
    }).pipe(
      tap(({ sessions, status }) => {
        this.participants.set(sessions.participants);
        this.status.set(status.status);
        this.syncFailed.set(false);
        this.markSynced();
        if (status.status !== 'Open') {
          this.stopSync();
        }
      }),
      catchError(() => {
        this.syncFailed.set(true);
        return EMPTY;
      }),
      finalize(() => (this.syncInFlight = false)),
    );
  }

  private markSynced(): void {
    this.updatedAt.set(new Date());
  }
}
