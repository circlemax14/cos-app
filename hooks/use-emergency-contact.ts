import { useCallback, useEffect, useState } from 'react';
import { processFastenHealthDataFromFile } from '@/services/fasten-health-processor';

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
 * Loads emergency contacts from file processing (no local database)
 */
export function useEmergencyContact() {
  const [emergencyContacts, setEmergencyContacts] = useState<EmergencyContactData[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const loadEmergencyContacts = useCallback(async () => {
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
      console.error('Error loading emergency contacts:', error);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadEmergencyContacts();
  }, [loadEmergencyContacts]);

  return {
    emergencyContacts,
    isLoading,
    refreshEmergencyContacts: loadEmergencyContacts,
  };
}
