package s3

import (
	"bytes"
	"context"
	"errors"
	"fmt"
	"strings"

	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/config"
	"github.com/aws/aws-sdk-go-v2/credentials"
	awss3 "github.com/aws/aws-sdk-go-v2/service/s3"
	"github.com/aws/smithy-go"
	"github.com/axelfrache/paper/backend/internal/core/domain"
	"github.com/axelfrache/paper/backend/internal/core/port"
)

type Config struct {
	Endpoint  string
	Region    string
	Bucket    string
	AccessKey string
	SecretKey string
}

type ImageStorage struct {
	client *awss3.Client
	bucket string
}

func New(ctx context.Context, cfg Config) (*ImageStorage, error) {
	if strings.TrimSpace(cfg.Endpoint) == "" || strings.TrimSpace(cfg.Bucket) == "" {
		return nil, errors.New("S3 endpoint and bucket are required")
	}
	awsConfig, err := config.LoadDefaultConfig(ctx,
		config.WithRegion(cfg.Region),
		config.WithCredentialsProvider(credentials.NewStaticCredentialsProvider(cfg.AccessKey, cfg.SecretKey, "")),
	)
	if err != nil {
		return nil, fmt.Errorf("load S3 config: %w", err)
	}
	client := awss3.NewFromConfig(awsConfig, func(options *awss3.Options) {
		options.BaseEndpoint = aws.String(strings.TrimRight(cfg.Endpoint, "/"))
		options.UsePathStyle = true
	})
	return &ImageStorage{client: client, bucket: cfg.Bucket}, nil
}

func (s *ImageStorage) Put(ctx context.Context, key string, upload domain.ImageUpload) error {
	_, err := s.client.PutObject(ctx, &awss3.PutObjectInput{
		Bucket:      aws.String(s.bucket),
		Key:         aws.String(key),
		Body:        bytes.NewReader(upload.Data),
		ContentType: aws.String(upload.ContentType),
		Metadata:    map[string]string{"filename": upload.Name},
	})
	return err
}

func (s *ImageStorage) Open(ctx context.Context, key string) (port.StoredImage, error) {
	object, err := s.client.GetObject(ctx, &awss3.GetObjectInput{
		Bucket: aws.String(s.bucket),
		Key:    aws.String(key),
	})
	if err != nil {
		var apiErr smithy.APIError
		if errors.As(err, &apiErr) && (apiErr.ErrorCode() == "NoSuchKey" || apiErr.ErrorCode() == "NoSuchObject") {
			return port.StoredImage{}, domain.NewNotFoundError("Image was not found.")
		}
		return port.StoredImage{}, err
	}
	return port.StoredImage{
		Body:        object.Body,
		Name:        object.Metadata["filename"],
		ContentType: aws.ToString(object.ContentType),
		Size:        aws.ToInt64(object.ContentLength),
		ETag:        strings.Trim(aws.ToString(object.ETag), `"`),
	}, nil
}

func (s *ImageStorage) Delete(ctx context.Context, key string) error {
	_, err := s.client.DeleteObject(ctx, &awss3.DeleteObjectInput{
		Bucket: aws.String(s.bucket),
		Key:    aws.String(key),
	})
	return err
}
