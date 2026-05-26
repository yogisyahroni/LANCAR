package service

import (
	"context"
	"fmt"
	"io"
	"path/filepath"

	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/config"
	"github.com/aws/aws-sdk-go-v2/feature/s3/manager"
	"github.com/aws/aws-sdk-go-v2/service/s3"
	"github.com/google/uuid"
)

type S3Storage struct {
	client *s3.Client
	bucket string
	region string
}

func NewS3Storage(region, bucket string) (*S3Storage, error) {
	cfg, err := config.LoadDefaultConfig(context.TODO(), config.WithRegion(region))
	if err != nil {
		return nil, fmt.Errorf("unable to load SDK config: %w", err)
	}

	client := s3.NewFromConfig(cfg)
	return &S3Storage{
		client: client,
		bucket: bucket,
		region: region,
	}, nil
}

func (s *S3Storage) Save(ctx context.Context, filename string, content io.Reader) (string, error) {
	ext := safeStorageExtension(filename)
	if ext == "" {
		return "", fmt.Errorf("unsupported storage file extension")
	}
	newFilename := uuid.New().String() + ext

	uploader := manager.NewUploader(s.client)
	_, err := uploader.Upload(ctx, &s3.PutObjectInput{
		Bucket: aws.String(s.bucket),
		Key:    aws.String(newFilename),
		Body:   content,
	})

	if err != nil {
		return "", fmt.Errorf("failed to upload to S3: %w", err)
	}

	return fmt.Sprintf("s3://%s/%s", s.bucket, newFilename), nil
}

func (s *S3Storage) Delete(ctx context.Context, fileID string) error {
	key := filepath.Base(fileID)
	_, err := s.client.DeleteObject(ctx, &s3.DeleteObjectInput{
		Bucket: aws.String(s.bucket),
		Key:    aws.String(key),
	})
	return err
}

func (s *S3Storage) GetURL(ctx context.Context, fileID string) (string, error) {
	key := filepath.Base(fileID)
	return fmt.Sprintf("s3://%s/%s", s.bucket, key), nil
}
