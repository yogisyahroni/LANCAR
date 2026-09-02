package repository

import (
	"context"
	"database/sql"
	"os"
	"sync"
	"testing"
	"time"

	"tembus/order-service/internal/domain"

	"github.com/google/uuid"
	_ "github.com/lib/pq"
)

// This test is intentionally migration-backed. It is skipped for local unit
// runs without a database, but the staging CI job always supplies the test
// DSN and runs every migration before executing it.
func TestFoodInventoryReservationPreventsConcurrentOversell(t *testing.T) {
	dsn := os.Getenv("TEMBUS_ORDER_SERVICE_TEST_DATABASE_URL")
	if dsn == "" {
		t.Skip("TEMBUS_ORDER_SERVICE_TEST_DATABASE_URL is not configured")
	}

	db, err := sql.Open("postgres", dsn)
	if err != nil {
		t.Fatalf("open postgres: %v", err)
	}
	defer db.Close()
	db.SetMaxOpenConns(8)
	db.SetMaxIdleConns(8)
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()
	if err := db.PingContext(ctx); err != nil {
		t.Fatalf("ping postgres: %v", err)
	}

	customerID := uuid.NewString()
	merchantID := uuid.NewString()
	menuID := uuid.NewString()
	if _, err := db.ExecContext(ctx, `
		INSERT INTO users (id, phone_number, full_name, role, status)
		VALUES ($1, $2, 'Food inventory integration customer', 'customer', 'active')`,
		customerID, "inventory-customer-"+customerID[:12]); err != nil {
		t.Fatalf("insert customer fixture: %v", err)
	}
	if _, err := db.ExecContext(ctx, `
		INSERT INTO merchants (id, user_id, nama_toko, alamat, lokasi, is_open, verification_status)
		VALUES ($1, $2, 'Inventory Integration Merchant', 'Jl. Inventory 1',
			ST_SetSRID(ST_MakePoint(106.8, -6.2), 4326), TRUE, 'approved')`,
		merchantID, customerID); err != nil {
		t.Fatalf("insert merchant fixture: %v", err)
	}
	if _, err := db.ExecContext(ctx, `
		INSERT INTO merchant_menu_items
			(id, merchant_id, nama, harga, prep_time_minutes, is_available,
			 stock_quantity, daily_sales_limit, daily_sales_count)
		VALUES ($1, $2, 'Inventory test item', 25000, 10, TRUE, 1, 1, 0)`,
		menuID, merchantID); err != nil {
		t.Fatalf("insert menu fixture: %v", err)
	}
	defer func() {
		_, _ = db.ExecContext(context.Background(), `DELETE FROM orders WHERE customer_id = $1`, customerID)
		_, _ = db.ExecContext(context.Background(), `DELETE FROM merchant_menu_items WHERE id = $1`, menuID)
		_, _ = db.ExecContext(context.Background(), `DELETE FROM merchants WHERE id = $1`, merchantID)
		_, _ = db.ExecContext(context.Background(), `DELETE FROM users WHERE id = $1`, customerID)
	}()

	repo := &foodRepo{postgresRepo: &postgresRepo{
		db:         db,
		readDB:     db,
		configRepo: inventoryTestConfig{},
	}}
	orders := []*domain.Order{
		newInventoryTestOrder(customerID, merchantID),
		newInventoryTestOrder(customerID, merchantID),
	}
	items := func() []domain.FoodOrderItem {
		return []domain.FoodOrderItem{{
			MenuItemID: menuID,
			ItemName:   "Inventory test item",
			ItemPrice:  25000,
			Quantity:   1,
			Subtotal:   25000,
		}}
	}

	results := make(chan error, len(orders))
	var wg sync.WaitGroup
	for _, order := range orders {
		wg.Add(1)
		go func(order *domain.Order) {
			defer wg.Done()
			results <- repo.CreateFoodOrderWithItems(ctx, order, items())
		}(order)
	}
	wg.Wait()
	close(results)

	successes := 0
	failures := 0
	for createErr := range results {
		if createErr == nil {
			successes++
		} else {
			failures++
		}
	}
	if successes != 1 || failures != 1 {
		t.Fatalf("expected one successful reservation and one rejection, successes=%d failures=%d", successes, failures)
	}

	var stock, sales, reservations int
	if err := db.QueryRowContext(ctx, `SELECT stock_quantity, daily_sales_count FROM merchant_menu_items WHERE id = $1`, menuID).Scan(&stock, &sales); err != nil {
		t.Fatalf("read inventory after race: %v", err)
	}
	if err := db.QueryRowContext(ctx, `SELECT COUNT(*) FROM food_inventory_reservations WHERE menu_item_id = $1 AND status = 'reserved'`, menuID).Scan(&reservations); err != nil {
		t.Fatalf("count inventory reservations: %v", err)
	}
	if stock != 0 || sales != 1 || reservations != 1 {
		t.Fatalf("inventory oversell detected: stock=%d sales=%d reservations=%d", stock, sales, reservations)
	}
}

type inventoryTestConfig struct{}

func (inventoryTestConfig) GetConfig(context.Context, string) (*domain.SystemConfig, error) {
	return nil, nil
}

func (inventoryTestConfig) GetFloatConfig(_ context.Context, _ string, fallback float64) float64 {
	return fallback
}
func (inventoryTestConfig) GetIntConfig(_ context.Context, _ string, fallback int) int {
	return fallback
}
func (inventoryTestConfig) GetStringConfig(_ context.Context, _ string, fallback string) string {
	return fallback
}

func newInventoryTestOrder(customerID, merchantID string) *domain.Order {
	orderID := uuid.NewString()
	merchant := merchantID
	return &domain.Order{
		ID:              orderID,
		OrderNumber:     "inventory-" + orderID[:12],
		CustomerID:      customerID,
		Model:           "p2p",
		Status:          domain.StatusPendingMerchant,
		PickupAddress:   "Inventory merchant",
		PickupLat:       -6.2,
		PickupLng:       106.8,
		DropoffAddress:  "Inventory customer",
		DropoffLat:      -6.21,
		DropoffLng:      106.81,
		BasePriceIDR:    25000,
		TotalPriceIDR:   25000,
		ServiceSubType:  "food_delivery",
		ServiceCategory: domain.CanonicalFood,
		MerchantID:      &merchant,
		PrepTimeMinutes: intPointer(10),
		CreatedAt:       time.Now().UTC(),
		UpdatedAt:       time.Now().UTC(),
	}
}

func intPointer(value int) *int { return &value }
