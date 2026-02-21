'use client';

import { useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { TransactionList } from '../components/transactions/transaction-list';
import { TransactionDetail } from '../components/transactions/transaction-detail';

export default function TransactionsPage() {
  const searchParams = useSearchParams();
  const initialId = searchParams.get('id');
  const [selectedId, setSelectedId] = useState<string | null>(initialId);

  if (selectedId) {
    return <TransactionDetail transactionId={selectedId} onBack={() => setSelectedId(null)} />;
  }

  return <TransactionList onSelect={(tx) => setSelectedId(tx.id)} />;
}
