-- 14_medical_document_types.sql
-- Drop old check constraint and recreate it to support expanded clinical document types

ALTER TABLE medical_documents DROP CONSTRAINT IF EXISTS medical_documents_document_type_check;
ALTER TABLE medical_documents ADD CONSTRAINT medical_documents_document_type_check
    CHECK (document_type IN ('PRESCRIPTION', 'LAB_REPORT', 'MEDICAL_RECORD', 'INSURANCE_DOCUMENT', 'DISCHARGE_SUMMARY'));
