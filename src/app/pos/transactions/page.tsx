'use client';

import { useState } from 'react';
import { TransactionList } from '../components/transactions/transaction-list';
import { TransactionDetail } from '../components/transactions/transaction-detail';

export default function TransactionsPage() {
  const [selectedId, setSelectedId] = useState<string | null>(null);

  if (selectedId) {
    return <TransactionDetail transactionId={selectedId} onBack={() => setSelectedId(null)} />;
  }

  return <TransactionList onSelect={(tx) => setSelectedId(tx.id)} />;
}
