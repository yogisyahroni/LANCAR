-- Migration: HR Careers
-- This migration creates tables for Job Postings and Job Applications.
-- Date: 2024-06-15

BEGIN;

CREATE TABLE IF NOT EXISTS job_postings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title VARCHAR(255) NOT NULL,
    department VARCHAR(100) NOT NULL,
    location VARCHAR(100) NOT NULL,
    employment_type VARCHAR(50) NOT NULL, -- e.g., Full-time, Part-time, Contract
    description TEXT NOT NULL,
    requirements TEXT NOT NULL,
    status VARCHAR(30) NOT NULL DEFAULT 'draft', -- active, draft, closed
    created_by UUID, -- HR Staff who created it
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    deleted_at TIMESTAMP WITH TIME ZONE,
    CONSTRAINT fk_job_created_by FOREIGN KEY (created_by) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS job_applications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    job_posting_id UUID NOT NULL,
    full_name VARCHAR(255) NOT NULL,
    email VARCHAR(255) NOT NULL,
    phone_number VARCHAR(20) NOT NULL,
    portfolio_url TEXT,
    cover_letter TEXT,
    status VARCHAR(30) NOT NULL DEFAULT 'new', -- new, reviewed, interviewing, offered, hired, rejected
    reviewed_by UUID, -- HR Staff who reviewed it
    reviewed_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    CONSTRAINT fk_app_job FOREIGN KEY (job_posting_id) REFERENCES job_postings(id) ON DELETE CASCADE,
    CONSTRAINT fk_app_reviewed_by FOREIGN KEY (reviewed_by) REFERENCES users(id)
);

COMMIT;
