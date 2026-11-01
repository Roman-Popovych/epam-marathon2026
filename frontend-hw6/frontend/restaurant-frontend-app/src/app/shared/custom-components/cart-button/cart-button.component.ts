import { ChangeDetectionStrategy, Component, computed, inject, input, output } from '@angular/core';
import { CartStore } from '@app/services/pre-orders/cart.store';

@Component({
  selector: 'app-cart-button',
  templateUrl: './cart-button.component.html',
  styleUrl: './cart-button.component.scss',
  changeDetection: ChangeDetectionStrategy.Eager,
})
export class CartButtonComponent {
  private readonly cartStore = inject(CartStore);

  /** Shows the "Cart" caption next to the icon (mobile menu). */
  readonly showLabel = input(false);
  readonly size = input<'small' | 'large'>('small');

  readonly cartClick = output<void>();

  readonly count = this.cartStore.itemCount;
  readonly badge = computed(() => (this.count() > 99 ? '99+' : String(this.count())));
  /** One-element list keyed by the tick: a new element replays the bump animation on every added dish. */
  readonly bumpKeys = computed(() => [this.cartStore.addedTick()]);
  readonly ariaLabel = computed(() => {
    const count = this.count();
    return count === 0 ? 'Cart is empty' : `Cart, ${count} ${count === 1 ? 'dish' : 'dishes'}`;
  });

  constructor() {
    this.cartStore.load();
  }
}
