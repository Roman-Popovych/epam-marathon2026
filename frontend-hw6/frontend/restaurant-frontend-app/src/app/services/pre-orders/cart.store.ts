import { computed, inject, Injectable, signal } from '@angular/core';
import { finalize } from 'rxjs';
import { DishListResponse } from '@app/models/dishes/dish-list-response.model';
import { Order } from '@app/models/orders/order.model';
import { ToastService } from '@app/services/toast/toast.service';
import { PreOrdersService } from './pre-orders.service';

/** Order.status 0 — pre-order is still in the cart and can be changed. */
const EDITABLE_STATUS = 0;

/**
 * Pre-orders of the signed-in customer, shared by the header badge, the menu and the cart.
 * Changes show up immediately; the server is updated in the background, one request per order at a time.
 */
@Injectable({ providedIn: 'root' })
export class CartStore {
  private readonly preOrders = inject(PreOrdersService);
  private readonly toast = inject(ToastService);

  private readonly savingReservations = new Set<string>();
  private readonly pendingReservations = new Set<string>();
  private loading = false;

  readonly orders = signal<Order[]>([]);
  /** Grows on every added dish — the header uses it to replay the cart animation. */
  readonly addedTick = signal(0);

  readonly itemCount = computed(() =>
    this.orders()
      .filter((order) => order.status === EDITABLE_STATUS)
      .reduce((sum, order) => sum + order.orderItems.reduce((acc, item) => acc + item.quantity, 0), 0),
  );

  load(): void {
    if (this.loading) {
      return;
    }
    this.loading = true;
    this.preOrders
      .getPreOrders()
      .pipe(finalize(() => (this.loading = false)))
      .subscribe({
        next: (orders) => this.orders.set(orders),
        error: () => this.orders.set([]),
      });
  }

  /** dishId → quantity in the pre-order of the given reservation. */
  quantitiesFor(reservationId: string): Map<string, number> {
    const order = this.findOrder(reservationId);
    return new Map(order?.orderItems.map((item) => [item.dish.id, item.quantity]) ?? []);
  }

  changeQuantity(reservationId: string, dish: DishListResponse, delta: number): void {
    const order = this.findOrder(reservationId);
    if (order && order.status !== EDITABLE_STATUS) {
      this.toast.info('This pre-order is already submitted. Open the cart and press Edit to change it.');
      return;
    }

    const current = order?.orderItems.find((item) => item.dish.id === dish.id)?.quantity ?? 0;
    const next = Math.max(0, current + delta);
    if (next === current) {
      return;
    }

    this.orders.update((orders) => {
      const base: Order = order ?? {
        orderId: '',
        reservationId,
        reservationAddress: '',
        reservationTime: '',
        orderItems: [],
        status: EDITABLE_STATUS,
      };
      const items =
        current === 0
          ? [...base.orderItems, { dish, quantity: next, state: 0 }]
          : base.orderItems.map((item) => (item.dish.id === dish.id ? { ...item, quantity: next } : item));
      const updated: Order = { ...base, orderItems: items.filter((item) => item.quantity > 0) };
      return order ? orders.map((item) => (item === order ? updated : item)) : [...orders, updated];
    });

    if (delta > 0) {
      this.addedTick.update((tick) => tick + 1);
    }
    this.save(reservationId);
  }

  /** Sends the latest state of the order; changes made while a request is running are sent right after it. */
  private save(reservationId: string): void {
    if (this.savingReservations.has(reservationId)) {
      this.pendingReservations.add(reservationId);
      return;
    }

    const order = this.findOrder(reservationId);
    if (!order) {
      return;
    }
    if (!order.orderId && order.orderItems.length === 0) {
      // created and emptied before it reached the server — nothing to send
      this.orders.update((orders) => orders.filter((item) => item !== order));
      return;
    }

    this.savingReservations.add(reservationId);
    const request$ = order.orderId
      ? this.preOrders.editPreOrderByReservationId(reservationId, order)
      : this.preOrders.createPreOrder({ reservationId, orderItems: order.orderItems });

    request$.subscribe({
      next: (response) => {
        const created = response as Partial<Order> | null;
        this.orders.update((orders) =>
          orders
            .map((item) =>
              item.reservationId === reservationId && !item.orderId && created?.orderId
                ? { ...item, orderId: created.orderId }
                : item,
            )
            // an order without dishes is deleted on the server (see editPreOrderByReservationId)
            .filter((item) => item.reservationId !== reservationId || item.orderItems.length > 0),
        );
        this.finishSave(reservationId);
      },
      error: () => {
        // the error toast is shown by tokenInterceptor; bring back what the server really has
        this.pendingReservations.delete(reservationId);
        this.savingReservations.delete(reservationId);
        this.load();
      },
    });
  }

  private finishSave(reservationId: string): void {
    this.savingReservations.delete(reservationId);
    if (this.pendingReservations.delete(reservationId)) {
      this.save(reservationId);
    }
  }

  private findOrder(reservationId: string): Order | undefined {
    return this.orders().find((order) => order.reservationId === reservationId);
  }
}
