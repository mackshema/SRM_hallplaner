# Hall Harmony Planner — Backup & Restore Guide

## BEFORE ANY EXAM SESSION
Run manually: cd backend && npm run backup
This creates a full snapshot in ./backups/

## AUTOMATIC BACKUPS
Created automatically before every timetable upload.
Location: ./backups/auto-<timestamp>/
Last 5 kept automatically.

## RESTORE PROCEDURE
1. Stop the backend: pm2 stop hall-harmony-backend
2. Restore: mongorestore --db exam_hall_allotment ./backups/<folder>/exam_hall_allotment
3. Restart: pm2 start hall-harmony-backend
4. Verify: check exam sessions and seating plans in admin UI

## WHAT IS BACKED UP
All 13 collections in exam_hall_allotment database.

## BACKUP SCHEDULE RECOMMENDATION
- Daily during exam week (set a reminder)
- Always before timetable upload (automatic from code)
- Always before any bulk student import
