import { ComponentFixture, TestBed } from '@angular/core/testing';
import { DishCardComponent } from './dish-card.component';
import { DishListResponse } from '@app/models/dishes/dish-list-response.model';
import { DishState } from '@app/models/enums/dish-state.model';

describe('DishCardComponent', () => {
  let component: DishCardComponent;
  let fixture: ComponentFixture<DishCardComponent>;

  const dish: DishListResponse = {
    id: 'dish-1',
    name: 'Khachapuri',
    imageUrl: 'assets/img/dish.png',
    price: 15,
    state: DishState.Available,
    weight: '350',
    dishType: 'MainCourse',
    description: 'Georgian cheese bread',
    calories: '500',
    proteins: '20',
    carbohydrates: '45',
    fats: '25',
    vitamins: 'A, B',
  };

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [DishCardComponent],
    }).compileComponents();

    fixture = TestBed.createComponent(DishCardComponent);
    component = fixture.componentInstance;

    fixture.componentRef.setInput('dish', dish);
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  describe('pre-order quantity', () => {
    function buttons(): HTMLButtonElement[] {
      return [...(fixture.nativeElement as HTMLElement).querySelectorAll('button')];
    }

    beforeEach(() => {
      fixture.componentRef.setInput('preOrderEnabled', true);
    });

    it('not in the cart yet: shows the Pre-Order button', () => {
      fixture.detectChanges();
      expect((fixture.nativeElement as HTMLElement).textContent).toContain('Pre-Order');
      expect((fixture.nativeElement as HTMLElement).querySelector('.quantity-stepper')).toBeNull();
    });

    it('already in the cart: shows how many portions and − / + instead of Pre-Order', () => {
      fixture.componentRef.setInput('quantity', 2);
      fixture.detectChanges();

      const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
      expect(text).toContain('2 in cart');
      expect(text).not.toContain('Pre-Order');
      expect(buttons().map((b) => b.getAttribute('aria-label'))).toEqual([
        'Remove one Khachapuri',
        'Add one more Khachapuri',
      ]);
    });

    it('− and + emit -1 and +1', () => {
      fixture.componentRef.setInput('quantity', 1);
      fixture.detectChanges();
      const changes: number[] = [];
      component.quantityChange.subscribe((delta) => changes.push(delta));

      buttons()[0].click();
      buttons()[1].click();

      expect(changes).toEqual([-1, 1]);
    });
  });
});
