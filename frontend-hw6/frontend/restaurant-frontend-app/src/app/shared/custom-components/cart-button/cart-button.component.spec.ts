import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { CartStore } from '@app/services/pre-orders/cart.store';
import { CartButtonComponent } from './cart-button.component';

describe('CartButtonComponent', () => {
  const itemCount = signal(0);
  const addedTick = signal(0);

  function render(): { element: HTMLElement; detect: () => void } {
    TestBed.configureTestingModule({
      imports: [CartButtonComponent],
      providers: [{ provide: CartStore, useValue: { itemCount, addedTick, load: jasmine.createSpy('load') } }],
    });
    const fixture = TestBed.createComponent(CartButtonComponent);
    fixture.detectChanges();
    return { element: fixture.nativeElement as HTMLElement, detect: () => fixture.detectChanges() };
  }

  beforeEach(() => {
    itemCount.set(0);
    addedTick.set(0);
  });

  it('empty cart: no badge, accessible name says the cart is empty', () => {
    const { element } = render();
    expect(element.querySelector('.cart-badge')).toBeNull();
    expect(element.querySelector('button')?.getAttribute('aria-label')).toBe('Cart is empty');
  });

  it('shows how many dishes are in the cart', () => {
    itemCount.set(3);
    const { element } = render();
    expect(element.querySelector('.cart-badge')?.textContent?.trim()).toBe('3');
    expect(element.querySelector('button')?.getAttribute('aria-label')).toBe('Cart, 3 dishes');
  });

  it('plays the bump animation after a dish is added', () => {
    const { element, detect } = render();
    expect(element.querySelector('.cart-icon.bump')).toBeNull();

    itemCount.set(1);
    addedTick.set(1);
    detect();

    expect(element.querySelector('.cart-icon.bump')).not.toBeNull();
  });
});
