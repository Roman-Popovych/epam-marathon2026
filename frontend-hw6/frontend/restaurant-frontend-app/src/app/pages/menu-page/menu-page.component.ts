import {Component, OnInit, ChangeDetectionStrategy, computed, inject, signal} from '@angular/core';
import { DishCardComponent } from '@app/shared/custom-components/dish-card/dish-card.component';
import { DishesService } from '@app/services/dishes/dishes.service';
import { DishListResponse } from '@app/models/dishes/dish-list-response.model';
import { MainCoverImageComponent } from '@app/shared/custom-components/main-cover-image/main-cover-image.component';
import { RouterModule, ActivatedRoute, Router } from '@angular/router';
import { DishSort } from '@app/models/enums/dish-sort.model';
import { DishType } from '@app/models/enums/dish-type.model';
import { DishSortingLabels, DishTypeLabels } from '@app/shared/mappers/dish-enum.mapper';
import { DishModalComponent } from '@app/components/dish-modal/dish-modal.component';
import { CartStore } from '@app/services/pre-orders/cart.store';
import {ToastService} from '@app/services/toast/toast.service';

@Component({
  selector: 'app-menu-page',
  standalone: true,
  imports: [
    RouterModule,
    DishCardComponent,
    MainCoverImageComponent,
    DishModalComponent
  ],
  templateUrl: './menu-page.component.html',
  styleUrl: './menu-page.component.scss',
  changeDetection: ChangeDetectionStrategy.Eager,
  providers: [DishesService],
})
export class MenuPageComponent implements OnInit {
  private toast = inject(ToastService);
  dishes: DishListResponse[] = [];
  filteredDishes: DishListResponse[] = [];

  isPreOrderEnabled = false;
  preOrderReservationId?: string;
  preOrderReservationLabel?: string;

  sortOptions = Object.values(DishSort);
  sortLabels = DishSortingLabels;

  menuCategories = Object.values(DishType);
  menuCategoryLabels = DishTypeLabels;

  selectedCategory: DishType | null = null; // initially show all
  selectedSort: DishSort = DishSort.PopularityDescending;

  private readonly dishesService = inject(DishesService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly cartStore = inject(CartStore);

  private readonly cartReservationId = signal<string | null>(null);
  /** dishId → portions already in the pre-order of this reservation. */
  readonly cartQuantities = computed(() => {
    const reservationId = this.cartReservationId();
    return reservationId ? this.cartStore.quantitiesFor(reservationId) : new Map<string, number>();
  });

  ngOnInit(): void {
    this.route.queryParams.subscribe((params) => {
      const preOrder = params['preOrder'];
      this.isPreOrderEnabled = !!preOrder;
      if (this.isPreOrderEnabled) {
        this.preOrderReservationId = params['reservationId'];
        this.preOrderReservationLabel = params['reservationLabel'];
        this.cartReservationId.set(this.preOrderReservationId ?? null);
        this.cartStore.load();
        if (!this.preOrderReservationId) {
          console.error('Pre-order is enabled but no reservation ID provided.');
          this.toast.error('Pre-order is enabled but no reservation ID provided.', 'Error');
          this.isPreOrderEnabled = false;
        }
      }

      const category = params['category'] as DishType;
      const sort = params['sort'] as DishSort;

      this.selectedCategory =
        category && Object.values(DishType).includes(category) ? category : null;
      this.selectedSort =
        sort && Object.values(DishSort).includes(sort) ? sort : DishSort.PopularityDescending;

      this.loadDishes();
    });
  }

  loadDishes(): void {
    const category = this.selectedCategory ?? undefined;
    const sort = this.selectedSort;

    this.dishesService.getDishes(category, sort).subscribe((data) => {
      this.dishes = data.map((dish) => ({
        ...dish,
        imageUrl: dish.imageUrl || 'assets/img/dish.png',
        name: dish.name || 'Unknown Dish',
        price: dish.price || 0,
        weight: dish.weight || 'N/A',
        description: dish.description || 'N/A',
        state: dish.state || 'N/A',
        dishType: dish.dishType || 'N/A',
        calories: dish.calories || '0',
        proteins: dish.proteins || '0',
        fats: dish.fats || '0',
        carbohydrates: dish.carbohydrates || '0',
        vitamins: dish.vitamins || '0',
      }));

      this.filteredDishes = this.dishes;
    });
  }

  onCategorySelected(category: DishType): void {
    this.selectedCategory = this.selectedCategory === category ? null : category;

    this.router.navigate([], {
      relativeTo: this.route,
      queryParams: {
        category: this.selectedCategory || null,
        sort: this.selectedSort,
      },
      queryParamsHandling: 'merge',
    });
  }

  onSortChanged(event: Event): void {
    const selectElement = event.target as HTMLSelectElement;
    const sort = selectElement.value as DishSort;
    this.selectedSort = sort;

    this.router.navigate([], {
      relativeTo: this.route,
      queryParams: {
        category: this.selectedCategory || null,
        sort: this.selectedSort,
      },
      queryParamsHandling: 'merge',
      replaceUrl: true,
    });
  }

  selectedDish: DishListResponse | null = null;

  openModal(dish: DishListResponse) {
    this.selectedDish = dish;
  }

  closeModal() {
    this.selectedDish = null;
  }

  changeDishQuantity(dish: DishListResponse, delta: number): void {
    if (this.preOrderReservationId) {
      this.cartStore.changeQuantity(this.preOrderReservationId, dish, delta);
    }
  }
}
