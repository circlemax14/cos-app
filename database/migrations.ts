import { schemaMigrations, addColumns, createTable } from '@nozbe/watermelondb/Schema/migrations';

export default schemaMigrations({
  migrations: [
    {
      toVersion: 6,
      steps: [
        addColumns({
          table: 'doctors',
          columns: [
            { name: 'photo_url', type: 'string', isOptional: true },
            { name: 'provider_id', type: 'string', isOptional: true },
          ],
        }),
      ],
    },
    {
      toVersion: 7,
      steps: [
        createTable({
          name: 'proxies',
          columns: [
            { name: 'email', type: 'string', isIndexed: true },
            { name: 'status', type: 'string' },
            { name: 'consent_given', type: 'boolean' },
            { name: 'consent_date', type: 'string', isOptional: true },
            { name: 'patient_id', type: 'string', isOptional: true },
            { name: 'created_at', type: 'number' },
            { name: 'updated_at', type: 'number' },
          ],
        }),
      ],
    },
    {
      toVersion: 8,
      steps: [
        createTable({
          name: 'feature_permissions',
          columns: [
            { name: 'feature_key', type: 'string', isIndexed: true },
            { name: 'status', type: 'string' },
            { name: 'created_at', type: 'number' },
            { name: 'updated_at', type: 'number' },
          ],
        }),
      ],
    },
  ],
});
