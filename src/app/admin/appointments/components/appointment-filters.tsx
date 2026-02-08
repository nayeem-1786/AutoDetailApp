'use client';

import { SearchInput } from '@/components/ui/search-input';
import { Select } from '@/components/ui/select';

interface AppointmentFiltersProps {
  search: string;
  onSearchChange: (value: string) => void;
  statusFilter: string;
  onStatusChange: (value: string) => void;
  employeeFilter: string;
  onEmployeeChange: (value: string) => void;
  employees: Array<{ id: string; first_name: string; last_name: string; role: string }>;
}

export function AppointmentFilters({
  search,
  onSearchChange,
  statusFilter,
  onStatusChange,
  employeeFilter,
  onEmployeeChange,
  employees,
}: AppointmentFiltersProps) {
  return (
    <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <SearchInput
          value={search}
          onChange={onSearchChange}
          placeholder="Search customer name or phone..."
          className="w-full sm:flex-1 sm:max-w-xs"
        />
        <Select
          value={statusFilter}
          onChange={(e) => onStatusChange(e.target.value)}
          className="w-full sm:w-44"
        >
          <option value="all">All Statuses</option>
          <option value="pending">Pending</option>
          <option value="confirmed">Confirmed</option>
          <option value="in_progress">In Progress</option>
          <option value="completed">Completed</option>
          <option value="cancelled">Cancelled</option>
          <option value="no_show">No-Show</option>
        </Select>
        <Select
          value={employeeFilter}
          onChange={(e) => onEmployeeChange(e.target.value)}
          className="w-full sm:w-48"
        >
          <option value="all">All Employees</option>
          {employees.map((emp) => (
            <option key={emp.id} value={emp.id}>
              {emp.first_name} {emp.last_name}
            </option>
          ))}
          <option value="unassigned">Unassigned</option>
        </Select>
      </div>
    </div>
  );
}
