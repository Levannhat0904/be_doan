# Activity Logging Integration Guide

This guide outlines how to add activity logging to your controller actions.

## Step 1: Import the Activity Log Service

Add this import at the top of your controller file:

```typescript
import activityLogService from '../services/activityLogService';
```

dllfk
## Step 2: Add logging to your controller actions

### For Create operations:

```typescript
// After successfully creating a record
if (req.user?.id) {
  await activityLogService.logActivity(
    req.user.id,
    'create',
    'entityType', // e.g., 'student', 'room', 'building', etc.
    entityId,     // The ID of the newly created entity
    `Created entityType: ${entityName}`, // A descriptive message
    req           // Pass the request object for IP and user agent
  );
}
```

### For Update operations:

```typescript
// After successfully updating a record
if (req.user?.id) {
  await activityLogService.logActivity(
    req.user.id,
    'update',
    'entityType',
    entityId,
    `Updated entityType: ${before} -> ${after}`, // Optional: include before/after details
    req
  );
}
```

### For Delete operations:

```typescript
// After successfully deleting a record
if (req.user?.id) {
  await activityLogService.logActivity(
    req.user.id,
    'delete',
    'entityType',
    entityId,
    `Deleted entityType: ${entityName}`,
    req
  );
}
```

### For Status Change operations:

```typescript
// After changing the status of a record
if (req.user?.id) {
  await activityLogService.logActivity(
    req.user.id,
    'status_change',
    'entityType',
    entityId,
    `Changed entityType status: ${oldStatus} -> ${newStatus}`,
    req
  );
}
```

## Common Entity Types

Use these standardized entity types for consistency:
- 'student'
- 'admin'
- 'room'
- 'building'
- 'contract'
- 'invoice'
- 'maintenance'

## Common Action Types

Use these standardized action types for consistency:
- 'create'
- 'read'
- 'update'
- 'delete'
- 'login'
- 'logout'
- 'status_change'
- 'approval'
- 'rejection'
- 'payment'

## Error Handling

The activity logging service has built-in error handling, so the main operation won't fail if logging fails. However, any errors will be printed to the console for debugging purposes.