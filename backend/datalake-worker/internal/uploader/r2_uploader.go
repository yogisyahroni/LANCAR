package uploader

import (
	"bytes"
	"context"
	"fmt"
	"log"
	"os"
	"time"

	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/config"
	"github.com/aws/aws-sdk-go-v2/credentials"
	"github.com/aws/aws-sdk-go-v2/service/s3"
	"github.com/xitongsys/parquet-go-source/local"
	"github.com/xitongsys/parquet-go/parquet"
	"github.com/xitongsys/parquet-go/writer"
)

type GPSLog struct {
	CourierID string  `parquet:"name=courier_id, type=BYTE_ARRAY, convertedtype=UTF8, encoding=PLAIN_DICTIONARY"`
	OrderID   string  `parquet:"name=order_id, type=BYTE_ARRAY, convertedtype=UTF8, encoding=PLAIN_DICTIONARY"`
	Latitude  float64 `parquet:"name=latitude, type=DOUBLE"`
	Longitude float64 `parquet:"name=longitude, type=DOUBLE"`
	Timestamp int64   `parquet:"name=timestamp, type=INT64"`
}

type R2Uploader struct {
	client     *s3.Client
	bucketName string
}

func NewR2Uploader() (*R2Uploader, error) {
	accessKey := os.Getenv("R2_ACCESS_KEY_ID")
	secretKey := os.Getenv("R2_SECRET_ACCESS_KEY")
	endpoint := os.Getenv("R2_ENDPOINT")
	bucketName := os.Getenv("R2_BUCKET_NAME")

	if bucketName == "" {
		bucketName = "lancar-ai-datalake"
	}

	if accessKey == "" || secretKey == "" || endpoint == "" {
		log.Println("WARNING: R2 credentials not fully set. Uploads will be skipped or fail.")
	}

	customResolver := aws.EndpointResolverWithOptionsFunc(func(service, region string, options ...interface{}) (aws.Endpoint, error) {
		return aws.Endpoint{
			URL:               endpoint,
			HostnameImmutable: true,
			SigningRegion:     "auto",
		}, nil
	})

	cfg, err := config.LoadDefaultConfig(context.TODO(),
		config.WithEndpointResolverWithOptions(customResolver),
		config.WithCredentialsProvider(credentials.NewStaticCredentialsProvider(accessKey, secretKey, "")),
		config.WithRegion("auto"),
	)
	if err != nil {
		return nil, fmt.Errorf("unable to load AWS SDK config: %w", err)
	}

	client := s3.NewFromConfig(cfg)

	return &R2Uploader{
		client:     client,
		bucketName: bucketName,
	}, nil
}

func (u *R2Uploader) UploadBatch(logs []GPSLog) error {
	if len(logs) == 0 {
		return nil
	}

	// 1. Create a temporary local file for Parquet
	tmpFile := fmt.Sprintf("/tmp/gps_%d.parquet", time.Now().UnixNano())
	fw, err := local.NewLocalFileWriter(tmpFile)
	if err != nil {
		return fmt.Errorf("failed to create local file: %w", err)
	}
	defer os.Remove(tmpFile) // Cleanup
	defer fw.Close()

	pw, err := writer.NewParquetWriter(fw, new(GPSLog), 4)
	if err != nil {
		return fmt.Errorf("failed to create parquet writer: %w", err)
	}
	pw.RowGroupSize = 128 * 1024 * 1024
	pw.CompressionType = parquet.CompressionCodec_SNAPPY

	for _, logItem := range logs {
		if err = pw.Write(logItem); err != nil {
			return fmt.Errorf("failed to write row: %w", err)
		}
	}
	if err = pw.WriteStop(); err != nil {
		return fmt.Errorf("failed to stop parquet writer: %w", err)
	}
	fw.Close() // Ensure file is written to disk

	// 2. Read the file back for upload
	fileData, err := os.ReadFile(tmpFile)
	if err != nil {
		return fmt.Errorf("failed to read tmp parquet file: %w", err)
	}

	// 3. Upload to R2
	now := time.Now()
	objectKey := fmt.Sprintf("raw/gps/year=%04d/month=%02d/day=%02d/gps_%d.parquet",
		now.Year(), now.Month(), now.Day(), now.Unix())

	_, err = u.client.PutObject(context.TODO(), &s3.PutObjectInput{
		Bucket:      aws.String(u.bucketName),
		Key:         aws.String(objectKey),
		Body:        bytes.NewReader(fileData),
		ContentType: aws.String("application/vnd.apache.parquet"),
	})

	if err != nil {
		return fmt.Errorf("failed to upload to R2: %w", err)
	}

	log.Printf("Successfully uploaded %d records to s3://%s/%s", len(logs), u.bucketName, objectKey)
	return nil
}
