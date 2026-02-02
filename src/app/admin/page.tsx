'use client';

import { useAuth } from '@/lib/auth/auth-provider';
import { PageHeader } from '@/components/ui/page-header';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

export default function AdminDashboard() {
  const { employee, role } = useAuth();

  return (
    <div className="space-y-6">
      <PageHeader
        title={`Welcome, ${employee?.first_name || 'User'}`}
        description="Smart Detail Auto Spa & Supplies admin dashboard"
      />

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium text-gray-500">
              Role
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold capitalize">
              {role?.replace('_', ' ') || 'N/A'}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium text-gray-500">
              Status
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-green-600">Active</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium text-gray-500">
              Phase 1
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">Foundation</p>
            <p className="mt-1 text-xs text-gray-500">
              Data model, auth, CRUD, migration
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium text-gray-500">
              Next Phase
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">POS</p>
            <p className="mt-1 text-xs text-gray-500">
              Point of sale application
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
