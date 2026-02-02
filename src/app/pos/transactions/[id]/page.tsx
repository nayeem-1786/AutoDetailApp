'use client';

import { useParams, useRouter } from 'next/navigation';
import { TransactionDetail } from '../../components/transactions/transaction-detail';

export default function TransactionDetailPage() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;

  return (
    <TransactionDetail
      transactionId={id}
      onBack={() => router.push('/pos/transactions')}
    />
  );
}
