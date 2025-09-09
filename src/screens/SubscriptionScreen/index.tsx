// src/screens/SubscriptionScreen/index.tsx
import React, { useMemo, useState } from 'react';
import { View, Text, TouchableOpacity, ScrollView } from 'react-native';
import Plans from './plans';
import Billing from './billing';
import Usage from './usage';
import { useEntitlements } from '../../state/subs'; // guest/free/pro

type Tab = 'Plans' | 'Billing' | 'Usage';

type Props = {
  // 任意: ルーティングで初期タブを指定したい場合に使えます
  route?: { params?: { initialTab?: Tab } };
};

/**
 * ChatGPT Plus / Super Grok 風のプラン管理画面コンテナ
 * ・上部に現在プランの概要
 * ・タブ（Plans / Billing / Usage）で表示を切替
 * ・中身は ./plans.tsx, ./billing.tsx, ./usage.tsx に委譲
 */
export default function SubscriptionScreen({ route }: Props) {
  const { tier } = useEntitlements(); // 'guest' | 'free' | 'pro'
  const tabs = useMemo<Tab[]>(() => ['Plans', 'Billing', 'Usage'], []);
  const [tab, setTab] = useState<Tab>(route?.params?.initialTab ?? 'Plans');

  return (
    <View style={{ flex: 1, padding: 16, gap: 12 }}>
      {/* ヘッダー（現在のプラン） */}
      <View
        style={{
          padding: 16,
          borderRadius: 12,
          borderWidth: 1,
          borderColor: '#e6e6e6',
        }}
      >
        <Text style={{ fontSize: 18, fontWeight: '700' }}>アカウントとプラン</Text>
        <Text style={{ marginTop: 6, color: '#555' }}>
          現在のプラン:{' '}
          <Text style={{ fontWeight: '700' }}>{String(tier).toUpperCase()}</Text>
        </Text>
      </View>

      {/* タブ */}
      <View style={{ flexDirection: 'row', gap: 8 }}>
        {tabs.map((t) => {
          const active = tab === t;
          return (
            <TouchableOpacity
              key={t}
              onPress={() => setTab(t)}
              accessibilityRole="button"
              accessibilityState={{ selected: active }}
              style={{
                paddingVertical: 10,
                paddingHorizontal: 14,
                borderRadius: 999,
                backgroundColor: active ? 'black' : '#f2f2f2',
              }}
            >
              <Text
                style={{
                  color: active ? 'white' : '#111',
                  fontWeight: '600',
                }}
              >
                {t}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {/* コンテンツ */}
      <ScrollView style={{ flex: 1 }}>
        {tab === 'Plans' && <Plans />}
        {tab === 'Billing' && <Billing />}
        {tab === 'Usage' && <Usage />}
      </ScrollView>
    </View>
  );
}
