import { useDatabaseSafe, useDatabaseReady } from '@/database/DatabaseProvider';
import { useCallback, useEffect, useState } from 'react';
import { EmergencyContact } from '@/database/models';
import { processFastenHealthDataFromFile } from '@/services/fasten-health-processor';
import type { Database } from '@nozbe/watermelondb';

export interface EmergencyContactData {
  id: string;
  name: string;
  relationship?: string | null;
  phone: string;
  email?: string | null;
  clinicId: string;
  clinicName: string;
  patientId: string;
}

/**
 * Hook to manage emergency contact data
 * Loads all emergency contacts from database and syncs from API/processor
 */
export function useEmergencyContact() {
  const isDatabaseReady = useDatabaseReady();
  const database = useDatabaseSafe();
  const [emergencyContacts, setEmergencyContacts] = useState<EmergencyContactData[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const loadEmergencyContacts = useCallback(async () => {
    if (!isDatabaseReady || !database) {
      console.log('📊 Database not ready, loading emergency contacts from file processing...');
      // Fallback to file processing
      try {
        const processedData = await processFastenHealthDataFromFile();
        const contacts: EmergencyContactData[] = processedData.emergencyContacts.map((contact, index) => ({
          id: `ec-${contact.clinicId}-${index}`,
          name: contact.name,
          relationship: contact.relationship || null,
          phone: contact.phone,
          email: contact.email || null,
          clinicId: contact.clinicId,
          clinicName: contact.clinicName,
          patientId: contact.patientId,
        }));
        setEmergencyContacts(contacts);
      } catch (error) {
        console.error('❌ Error loading emergency contacts from file:', error);
      } finally {
        setIsLoading(false);
      }
      return;
    }

    try {
      const dbContacts = await database
        .get<EmergencyContact>('emergency_contacts')
        .query()
        .fetch();

      if (dbContacts.length > 0) {
        const contacts: EmergencyContactData[] = dbContacts.map(contact => ({
          id: contact.id,
          name: contact.name,
          relationship: contact.relationship,
          phone: contact.phone || '',
          email: contact.email,
          clinicId: contact.clinicId || '',
          clinicName: contact.clinicName || 'Unknown Clinic',
          patientId: contact.patientId || '',
        }));
        setEmergencyContacts(contacts);
        console.log(`✅ Loaded ${contacts.length} emergency contacts from database`);
      } else {
        // Try to load from file processing and sync to database
        console.log('📂 No emergency contacts in database, loading from file processing...');
        try {
          const processedData = await processFastenHealthDataFromFile();
          const contacts: EmergencyContactData[] = processedData.emergencyContacts.map((contact, index) => ({
            id: `ec-${contact.clinicId}-${index}`,
            name: contact.name,
            relationship: contact.relationship || null,
            phone: contact.phone,
            email: contact.email || null,
            clinicId: contact.clinicId,
            clinicName: contact.clinicName,
            patientId: contact.patientId,
          }));
          setEmergencyContacts(contacts);
          
          // Sync to database
          await syncEmergencyContactsToDatabase(processedData.emergencyContacts, database);
        } catch (error) {
          console.error('❌ Error loading emergency contacts from file:', error);
        }
      }
    } catch (error) {
      console.error('❌ Error loading emergency contacts:', error);
    } finally {
      setIsLoading(false);
    }
  }, [isDatabaseReady, database]);

  useEffect(() => {
    loadEmergencyContacts();
  }, [loadEmergencyContacts]);

  return {
    emergencyContacts,
    isLoading,
    refreshEmergencyContacts: loadEmergencyContacts,
  };
}

/**
 * Syncs emergency contacts from processed data to database
 */
async function syncEmergencyContactsToDatabase(
  contacts: Array<{
    name: string;
    relationship?: string;
    phone: string;
    email?: string;
    clinicId: string;
    clinicName: string;
    patientId: string;
  }>,
  database: Database
): Promise<void> {
  try {
    // Delete all existing emergency contacts
    const existing = await database
      .get<EmergencyContact>('emergency_contacts')
      .query()
      .fetch();

    await database.write(async () => {
      for (const contact of existing) {
        await contact.markAsDeleted();
      }
    });

    // Create new emergency contacts
    await database.write(async () => {
      for (const contact of contacts) {
        await database.get<EmergencyContact>('emergency_contacts').create(record => {
          record.name = contact.name;
          record.relationship = contact.relationship || null;
          record.phone = contact.phone;
          record.email = contact.email || null;
          record.clinicId = contact.clinicId;
          record.clinicName = contact.clinicName;
          record.patientId = contact.patientId;
          record.createdAt = new Date();
          record.updatedAt = new Date();
          record.syncedAt = new Date();
        });
      }
    });
    console.log(`✅ Synced ${contacts.length} emergency contacts to database`);
  } catch (error) {
    console.error('❌ Error syncing emergency contacts to database:', error);
    throw error;
  }
}
