import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { DishListResponse } from '@app/models/dishes/dish-list-response.model';
import { Order } from '@app/models/orders/order.model';
import { ToastService } from '@app/services/toast/toast.service';
import { API_BASE_URL } from '@app/shared/config/api-base-url.token';
import { CartStore } from './cart.store';

const BASE_URL = 'https://api.test';
const SALAD = { id: 'dish1', name: 'Spring Salad', price: 12 } as DishListResponse;
const BOWL = { id: 'dish2', name: 'Avocado Bowl', price: 14.5 } as DishListResponse;

function order(status: number, items: { dish: DishListResponse; quantity: number }[]): Order {
  return {
    orderId: 'order-1',
    reservationId: 'res-1',
    reservationAddress: '',
    reservationTime: '',
    status,
    orderItems: items.map((item) => ({ ...item, state: 0 })),
  };
}

describe('CartStore', () => {
  let store: CartStore;
  let http: HttpTestingController;
  let toast: jasmine.SpyObj<ToastService>;

  beforeEach(() => {
    toast = jasmine.createSpyObj<ToastService>('ToastService', ['info', 'error', 'success']);
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: API_BASE_URL, useValue: BASE_URL },
        { provide: ToastService, useValue: toast },
      ],
    });
    store = TestBed.inject(CartStore);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  function loadWith(orders: Order[]): void {
    store.load();
    http.expectOne(`${BASE_URL}/orders`).flush(orders);
  }

  it('counts dishes only in orders that are still in the cart', () => {
    loadWith([order(0, [{ dish: SALAD, quantity: 2 }, { dish: BOWL, quantity: 1 }]), { ...order(1, [{ dish: SALAD, quantity: 5 }]), reservationId: 'res-2' }]);
    expect(store.itemCount()).toBe(3);
  });

  it('shows the new quantity immediately and sends one PUT without reloading all orders', () => {
    loadWith([order(0, [{ dish: SALAD, quantity: 1 }])]);

    store.changeQuantity('res-1', SALAD, 1);

    expect(store.quantitiesFor('res-1').get('dish1')).toBe(2);
    expect(store.itemCount()).toBe(2);
    const req = http.expectOne(`${BASE_URL}/orders/res-1`);
    expect(req.request.method).toBe('PUT');
    expect(req.request.body).toEqual({ orderItems: [{ dishId: 'dish1', quantity: 2 }] });
    req.flush({});
  });

  it('creates the order with POST when the reservation has no pre-order yet', () => {
    loadWith([]);

    store.changeQuantity('res-1', BOWL, 1);

    const req = http.expectOne(`${BASE_URL}/orders`);
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({ reservationId: 'res-1', orderItems: [{ dishId: 'dish2', quantity: 1 }] });
    req.flush(order(0, [{ dish: BOWL, quantity: 1 }]));
    expect(store.orders()[0].orderId).toBe('order-1');
  });

  it('rapid clicks: one request at a time, then the latest state is sent', () => {
    loadWith([order(0, [{ dish: SALAD, quantity: 1 }])]);

    store.changeQuantity('res-1', SALAD, 1);
    store.changeQuantity('res-1', SALAD, 1);
    store.changeQuantity('res-1', SALAD, 1);

    const first = http.expectOne(`${BASE_URL}/orders/res-1`);
    expect(first.request.body.orderItems[0].quantity).toBe(2);
    first.flush({});

    const second = http.expectOne(`${BASE_URL}/orders/res-1`);
    expect(second.request.body.orderItems[0].quantity).toBe(4);
    second.flush({});
    expect(store.quantitiesFor('res-1').get('dish1')).toBe(4);
  });

  it('bumps addedTick only when a dish is added', () => {
    loadWith([order(0, [{ dish: SALAD, quantity: 2 }])]);

    store.changeQuantity('res-1', SALAD, -1);
    http.expectOne(`${BASE_URL}/orders/res-1`).flush({});
    expect(store.addedTick()).toBe(0);

    store.changeQuantity('res-1', SALAD, 1);
    http.expectOne(`${BASE_URL}/orders/res-1`).flush({});
    expect(store.addedTick()).toBe(1);
  });

  it('removing the last portion deletes the order on the server', () => {
    loadWith([order(0, [{ dish: SALAD, quantity: 1 }])]);

    store.changeQuantity('res-1', SALAD, -1);

    const req = http.expectOne(`${BASE_URL}/orders/res-1`);
    expect(req.request.method).toBe('DELETE');
    req.flush({});
    expect(store.orders().length).toBe(0);
    expect(store.itemCount()).toBe(0);
  });

  it('a submitted pre-order is not changed, the user is told how to edit it', () => {
    loadWith([order(1, [{ dish: SALAD, quantity: 1 }])]);

    store.changeQuantity('res-1', SALAD, 1);

    expect(toast.info).toHaveBeenCalled();
    expect(store.quantitiesFor('res-1').get('dish1')).toBe(1);
  });

  it('server error: reloads the real state of the cart', () => {
    loadWith([order(0, [{ dish: SALAD, quantity: 1 }])]);

    store.changeQuantity('res-1', SALAD, 1);
    http.expectOne(`${BASE_URL}/orders/res-1`).flush({ message: 'boom' }, { status: 500, statusText: 'Server Error' });

    http.expectOne(`${BASE_URL}/orders`).flush([order(0, [{ dish: SALAD, quantity: 1 }])]);
    expect(store.quantitiesFor('res-1').get('dish1')).toBe(1);
  });
});
