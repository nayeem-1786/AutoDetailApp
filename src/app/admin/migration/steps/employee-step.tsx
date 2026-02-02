'use client';

import { useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Users, CheckCircle } from 'lucide-react';
import type { MigrationState } from '@/lib/migration/types';

interface EmployeeStepProps {
  state: MigrationState;
  onStateChange: (state: MigrationState) => void;
  onContinue: () => void;
}

export function EmployeeStep({ state, onStateChange, onContinue }: EmployeeStepProps) {
  const [confirmed, setConfirmed] = useState(false);

  const transactionItems = state.parsedData.transactionItems || [];
  const transactions = state.parsedData.transactions || [];

  // Extract unique employee names from transaction data
  const employees = useMemo(() => {
    const empSet = new Map<string, { name: string; transactionCount: number }>();

    // From transaction items
    transactionItems.forEach((row) => {
      const name = (row['Employee'] || '').trim();
      if (name) {
        const existing = empSet.get(name);
        if (existing) {
          existing.transactionCount++;
        } else {
          empSet.set(name, { name, transactionCount: 1 });
        }
      }
    });

    // From transactions (Staff Name)
    transactions.forEach((row) => {
      const name = (row['Staff Name'] || '').trim();
      if (name && !empSet.has(name)) {
        empSet.set(name, { name, transactionCount: 1 });
      } else if (name && empSet.has(name)) {
        empSet.get(name)!.transactionCount++;
      }
    });

    return Array.from(empSet.values()).sort(
      (a, b) => b.transactionCount - a.transactionCount
    );
  }, [transactionItems, transactions]);

  const handleConfirm = () => {
    setConfirmed(true);
    const newState = { ...state };
    newState.steps = {
      ...state.steps,
      employees: {
        status: 'completed',
        count: employees.length,
        message: `${employees.length} employees found in transaction data. Setup via Staff management.`,
      },
    };
    onStateChange(newState);
  };

  const isCompleted = state.steps.employees.status === 'completed';

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-gray-900">Employee Setup</h2>
        <p className="mt-1 text-sm text-gray-500">
          Employees are extracted from transaction data. They should be set up manually through
          the Staff management page since each employee needs authentication credentials.
        </p>
      </div>

      {/* Employee Names Found */}
      {employees.length > 0 ? (
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Users className="h-4 w-4 text-gray-400" />
              <CardTitle className="text-sm">
                Employees Found in Transaction Data ({employees.length})
              </CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {employees.map((emp) => (
                <div
                  key={emp.name}
                  className="flex items-center justify-between rounded-lg border px-4 py-3"
                >
                  <div>
                    <p className="text-sm font-medium text-gray-900">{emp.name}</p>
                    <p className="text-xs text-gray-500">
                      {emp.transactionCount.toLocaleString()} transaction records
                    </p>
                  </div>
                  <Badge variant="info">Found</Badge>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="pt-6">
            <p className="text-sm text-gray-500">
              No employee/staff names found in transaction data. This may mean no transaction CSVs
              were uploaded, or the transactions don't have staff assignments.
            </p>
          </CardContent>
        </Card>
      )}

      {/* Instructions */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Setup Instructions</CardTitle>
        </CardHeader>
        <CardContent>
          <ol className="list-inside list-decimal space-y-2 text-sm text-gray-600">
            <li>
              Go to <span className="font-medium">Admin &gt; Staff</span> to create employee accounts
            </li>
            <li>
              Each employee needs: name, email, password, and role assignment
            </li>
            <li>
              After employees are created, their IDs will be used to match transactions during
              import
            </li>
            <li>
              Transaction matching uses the <span className="font-mono text-xs">Staff Name</span>{' '}
              field from Square data
            </li>
          </ol>
        </CardContent>
      </Card>

      {/* Confirmation */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex items-center justify-between">
            <p className="text-sm text-gray-600">
              {isCompleted || confirmed ? (
                <span className="flex items-center gap-2 font-medium text-green-700">
                  <CheckCircle className="h-4 w-4" />
                  Acknowledged - employees will be set up via Staff management
                </span>
              ) : (
                'Confirm you understand employee setup is manual, then continue.'
              )}
            </p>
            {isCompleted ? (
              <Button onClick={onContinue}>Continue to Vehicles</Button>
            ) : (
              <Button onClick={handleConfirm}>
                {confirmed ? 'Continue to Vehicles' : 'Acknowledge & Continue'}
              </Button>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
