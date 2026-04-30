package eventbus

import (
	"context"
	"encoding/json"
	"fmt"
	"lancar/order-service/internal/domain"

	"github.com/redis/go-redis/v9"
)

type redisEventBus struct {
	client *redis.Client
}

func NewRedisEventBus(client *redis.Client) domain.EventBus {
	return &redisEventBus{client: client}
}

func (b *redisEventBus) Publish(ctx context.Context, topic string, payload interface{}) error {
	data, err := json.Marshal(payload)
	if err != nil {
		return fmt.Errorf("failed to marshal event: %w", err)
	}

	return b.client.Publish(ctx, topic, data).Err()
}

func (b *redisEventBus) Subscribe(ctx context.Context, topic string) (<-chan string, error) {
	pubsub := b.client.Subscribe(ctx, topic)
	
	// Check connection
	_, err := pubsub.Receive(ctx)
	if err != nil {
		return nil, fmt.Errorf("failed to subscribe to topic %s: %w", topic, err)
	}

	ch := make(chan string)

	go func() {
		defer pubsub.Close()
		defer close(ch)

		redisCh := pubsub.Channel()
		for {
			select {
			case <-ctx.Done():
				return
			case msg, ok := <-redisCh:
				if !ok {
					return
				}
				ch <- msg.Payload
			}
		}
	}()

	return ch, nil
}
