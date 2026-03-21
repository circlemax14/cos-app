import { useQuery } from '@tanstack/react-query'
import { apiClient } from '@/lib/api-client'

export interface Appointment {
  id: string; date: string; time: string; type: string; status: string
  doctorName: string; doctorSpecialty: string; clinicName: string; notes?: string; diagnosis?: string
}

interface AppointmentFilters { status?: string; from?: string; to?: string; type?: string }

export function useAppointments(filters?: AppointmentFilters) {
  return useQuery({
    queryKey: ['appointments', filters],
    queryFn: async () => {
      const params = new URLSearchParams()
      if (filters?.status) params.set('status', filters.status)
      if (filters?.from) params.set('from', filters.from)
      if (filters?.to) params.set('to', filters.to)
      if (filters?.type) params.set('type', filters.type)
      const res = await apiClient.get(`/patients/me/appointments?${params.toString()}`)
      return res.data.data.appointments as Appointment[]
    },
    staleTime: 5 * 60 * 1000,
  })
}

export function useAppointment(id: string) {
  return useQuery({
    queryKey: ['appointments', id],
    queryFn: async () => {
      const res = await apiClient.get(`/patients/me/appointments/${id}`)
      return res.data.data.appointment as Appointment
    },
    enabled: !!id,
    staleTime: 5 * 60 * 1000,
  })
}
