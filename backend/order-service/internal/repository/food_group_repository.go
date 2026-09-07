package repository

import (
	"context"
	"database/sql"
	"fmt"
	"tembus/order-service/internal/domain"
	"time"
)

type foodGroupRepository struct{ db *sql.DB }

func NewFoodGroupRepository(db *sql.DB) domain.FoodGroupRepository {
	return &foodGroupRepository{db: db}
}

func (r *foodGroupRepository) CreateFoodGroup(ctx context.Context, group *domain.FoodGroupOrder) error {
	tx, err := r.db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()
	_, err = tx.ExecContext(ctx, `INSERT INTO food_group_orders (id, merchant_id, creator_user_id, status, deadline, split_enabled, created_at) VALUES ($1::uuid, $2::uuid, $3::uuid, $4, $5, $6, $7)`, group.ID, group.MerchantID, group.CreatorID, group.Status, group.Deadline, group.Split, group.CreatedAt)
	if err != nil {
		return fmt.Errorf("insert food group: %w", err)
	}
	_, err = tx.ExecContext(ctx, `INSERT INTO food_group_members (group_id, user_id, role, status, joined_at) VALUES ($1::uuid, $2::uuid, $3, $4, $5)`, group.ID, group.CreatorID, "creator", domain.FoodGroupMemberActive, group.CreatedAt)
	if err != nil {
		return fmt.Errorf("insert group creator: %w", err)
	}
	return tx.Commit()
}

func (r *foodGroupRepository) GetFoodGroup(ctx context.Context, groupID string) (*domain.FoodGroupOrder, error) {
	group := &domain.FoodGroupOrder{}
	err := r.db.QueryRowContext(ctx, `SELECT id::text, merchant_id::text, creator_user_id::text, status, deadline, split_enabled, created_at, closed_at FROM food_group_orders WHERE id = $1::uuid`, groupID).Scan(&group.ID, &group.MerchantID, &group.CreatorID, &group.Status, &group.Deadline, &group.Split, &group.CreatedAt, &group.ClosedAt)
	if err == sql.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, fmt.Errorf("get food group: %w", err)
	}
	rows, err := r.db.QueryContext(ctx, `SELECT user_id::text, role, status, joined_at FROM food_group_members WHERE group_id = $1::uuid ORDER BY joined_at, user_id`, groupID)
	if err != nil {
		return nil, fmt.Errorf("list group members: %w", err)
	}
	for rows.Next() {
		var m domain.FoodGroupMember
		if err := rows.Scan(&m.UserID, &m.Role, &m.Status, &m.JoinedAt); err != nil {
			rows.Close()
			return nil, err
		}
		group.Members = append(group.Members, m)
	}
	if err := rows.Err(); err != nil {
		rows.Close()
		return nil, err
	}
	rows.Close()
	rows, err = r.db.QueryContext(ctx, `SELECT id::text, member_user_id::text, menu_item_id::text, quantity, COALESCE(notes, ''), created_at FROM food_group_cart_items WHERE group_id = $1::uuid ORDER BY created_at, id`, groupID)
	if err != nil {
		return nil, fmt.Errorf("list group cart: %w", err)
	}
	for rows.Next() {
		var item domain.FoodGroupCartItem
		if err := rows.Scan(&item.ID, &item.MemberID, &item.MenuItemID, &item.Quantity, &item.Notes, &item.CreatedAt); err != nil {
			rows.Close()
			return nil, err
		}
		group.Cart = append(group.Cart, item)
	}
	if err := rows.Err(); err != nil {
		rows.Close()
		return nil, err
	}
	rows.Close()
	allocRows, err := r.db.QueryContext(ctx, `SELECT user_id::text, amount_idr, payment_state FROM food_group_split_allocations WHERE group_id = $1::uuid ORDER BY user_id`, groupID)
	if err != nil {
		return nil, fmt.Errorf("list group allocations: %w", err)
	}
	for allocRows.Next() {
		var allocation domain.FoodGroupAllocation
		if err := allocRows.Scan(&allocation.UserID, &allocation.AmountIDR, &allocation.PaymentState); err != nil {
			allocRows.Close()
			return nil, err
		}
		group.Allocations = append(group.Allocations, allocation)
	}
	if err := allocRows.Err(); err != nil {
		allocRows.Close()
		return nil, err
	}
	allocRows.Close()
	return group, nil
}

func (r *foodGroupRepository) AddFoodGroupMember(ctx context.Context, groupID, userID, role string) error {
	_, err := r.db.ExecContext(ctx, `INSERT INTO food_group_members (group_id, user_id, role, status) VALUES ($1::uuid, $2::uuid, $3, 'active') ON CONFLICT (group_id, user_id) DO UPDATE SET status = 'active'`, groupID, userID, role)
	return err
}

func (r *foodGroupRepository) LeaveFoodGroup(ctx context.Context, groupID, userID string) error {
	result, err := r.db.ExecContext(ctx, `UPDATE food_group_members SET status = 'left' WHERE group_id = $1::uuid AND user_id = $2::uuid AND role <> 'creator' AND status = 'active'`, groupID, userID)
	if err == nil {
		if count, _ := result.RowsAffected(); count == 0 {
			return domain.ErrNotFound
		}
	}
	return err
}

func (r *foodGroupRepository) AddFoodGroupCartItem(ctx context.Context, item *domain.FoodGroupCartItem) error {
	_, err := r.db.ExecContext(ctx, `INSERT INTO food_group_cart_items (id, group_id, member_user_id, menu_item_id, quantity, notes, created_at) VALUES ($1::uuid, $2::uuid, $3::uuid, $4::uuid, $5, NULLIF($6, ''), $7)`, item.ID, item.GroupID, item.MemberID, item.MenuItemID, item.Quantity, item.Notes, item.CreatedAt)
	return err
}

func (r *foodGroupRepository) RemoveFoodGroupCartItem(ctx context.Context, groupID, itemID, userID string) error {
	result, err := r.db.ExecContext(ctx, `DELETE FROM food_group_cart_items WHERE id = $1::uuid AND group_id = $2::uuid AND member_user_id = $3::uuid`, itemID, groupID, userID)
	if err == nil {
		if count, _ := result.RowsAffected(); count == 0 {
			return domain.ErrNotFound
		}
	}
	return err
}

func (r *foodGroupRepository) CloseFoodGroup(ctx context.Context, groupID, userID string, allocations []domain.FoodGroupAllocation) error {
	tx, err := r.db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()
	var creator string
	var status string
	err = tx.QueryRowContext(ctx, `SELECT creator_user_id::text, status FROM food_group_orders WHERE id = $1::uuid FOR UPDATE`, groupID).Scan(&creator, &status)
	if err == sql.ErrNoRows {
		return domain.ErrNotFound
	}
	if err != nil {
		return err
	}
	if creator != userID {
		return domain.ErrForbidden
	}
	if status != domain.FoodGroupStatusOpen {
		return fmt.Errorf("group is already closed")
	}
	now := time.Now()
	if _, err = tx.ExecContext(ctx, `UPDATE food_group_orders SET status = 'closed', closed_at = $2 WHERE id = $1::uuid`, groupID, now); err != nil {
		return err
	}
	for _, allocation := range allocations {
		if _, err = tx.ExecContext(ctx, `INSERT INTO food_group_split_allocations (group_id, user_id, amount_idr, payment_state) VALUES ($1::uuid, $2::uuid, $3, $4)`, groupID, allocation.UserID, allocation.AmountIDR, allocation.PaymentState); err != nil {
			return err
		}
	}
	return tx.Commit()
}
