# Milestone 18 Draft Report

**Date:** April 27, 2026  
**Project:** PTCF Room and Equipment Reservation Management System  
**Milestone:** Analytics Consumer + Admin View  
**Status:** Draft / Not Started

---

## Purpose

This file is a forward-looking reference for Milestone 18. It is not a completed milestone report yet. It exists so the next chat has a clear target for the analytics work without needing to rediscover the scope.

---

## Requirements Checklist

- [ ] Add `analytics-consumer` Kafka consumer group.
- [ ] Capture simple event counts by event type.
- [ ] Capture simple event counts by resource type.
- [ ] Capture simple event counts by booking type.
- [ ] Capture simple event counts by booking status.
- [ ] Add a minimal admin analytics view.
- [ ] Keep the implementation practical and lightweight.

---

## Intended Implementation Summary

Milestone 18 should stay deliberately small. The goal is to prove that booking events can feed a lightweight analytics surface without introducing a full reporting system.

Recommended shape:

- Add one consumer that listens to `booking-events`.
- Update a simple analytics table or summary store inside the existing backend.
- Keep the metrics basic: counts and recent summaries only.
- Expose a small admin-facing endpoint for the dashboard.
- Reuse the existing admin role guard so the new view stays private.

Suggested data points:

- event type counts
- booking type counts
- resource type counts
- status counts
- recent event summaries

---

## Verification Tests

Planned test command:

```bash
npm run test:milestone-18
```

Expected checks:

- Kafka disabled path should stay safe and non-blocking.
- Kafka enabled path should update analytics state from booking events.
- Admin analytics endpoint should return usable counts or summaries.
- UI should display the data clearly without heavy visualization work.

---

## Code Quality Assessment

The implementation should avoid over-engineering:

- no microservice split
- no schema registry
- no complex retry or dead-letter topology
- no heavy real-time dashboard framework

The only goal is a practical analytics proof of concept that fits the current MVP.

---

## Readiness Checklist

- [ ] Scope approved.
- [ ] Data model chosen.
- [ ] Consumer added.
- [ ] Admin endpoint added.
- [ ] Minimal admin UI added.
- [ ] Verification script added.

---

## Next Steps

Milestone 19 should focus on the end-to-end Kafka proof and the final documentation pass after analytics is in place.

---

## Summary

This is a planning reference for Milestone 18, not a completed report. It captures the intended scope so implementation can stay practical and aligned with the existing MVP.
