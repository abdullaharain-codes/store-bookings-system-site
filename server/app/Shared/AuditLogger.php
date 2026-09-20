<?php

namespace App\Shared;

use App\Models\AuditLog;

class AuditLogger
{
    /**
     * Record an audit trail entry. The authenticated user (if any) is
     * attributed automatically; console/system context yields a null actor.
     */
    public function log(string $entity, int|string $entityId, string $action, ?array $metadata = null): AuditLog
    {
        return AuditLog::create([
            'entity' => $entity,
            'entity_id' => $entityId,
            'action' => $action,
            'actor_id' => auth()->id(),
            'metadata' => $metadata,
        ]);
    }
}
