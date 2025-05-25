-- PostgreSQL initialization script for Corelive development database
-- This file is executed when the PostgreSQL container starts for the first time

-- Enable recommended extensions for PostgreSQL 17
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";

-- Set timezone to UTC for consistent timestamps
SET timezone = 'UTC';

-- Create any additional configurations here if needed
-- Note: Prisma will handle the schema creation through migrations 