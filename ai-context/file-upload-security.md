# File Upload Security

## Purpose

Defines safe handling of user-uploaded files.

---

# Core Rules

## 1. MIME Type Validation

Uploaded files must validate:

- extension
- MIME type

Both must match expected formats.

---

## 2. File Size Limits

Uploads must enforce strict size limits.

---

## 3. Malware Scanning

Files should be scanned using malware detection tools where possible.

---

## 4. Private Storage

Files must be stored in private storage.

Access must occur through:

- signed URLs
- authenticated endpoints

---

## Related Documents

- ../GEMINI.md
