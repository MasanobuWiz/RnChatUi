// src/navigation/index.tsx
import React from 'react';
import { View, ActivityIndicator, Platform } from 'react-native';
import { NavigationContainer, DefaultTheme, Theme } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';

// 画面
import { ChatScreen } from '../screens/ChatScreen';
import LoginScreen from '../screens/LoginScreen';
import SubscriptionScreen from '../screens/SubscriptionScreen';

// 認証 / サブスク状態（実装例は前回メッセージ参照）
import { useAuth } from '../state/auth';           // { loaded:boolean, signedIn:boolean, idToken?:string }
import { useEntitlements } from '../state/subs';   // { loaded:boolean, tier:'guest'|'free'|'pro' }

// ルート型（必要に応じて追加）
export type RootStackParamList = {
  Chat: undefined;
  Login: undefined;
  Subscribe: undefined;
  // Pro 専用画面を増やすならここへ追記:
  // ProDashboard: undefined;
  // ModelSettings: undefined;
  // KnowledgeBase: undefined;
  // Files: undefined;
  // Usage: undefined;
  // Billing: undefined;
};

const Stack = createNativeStackNavigator<RootStackParamList>();

// Web の白フラッシュ軽減（任意）
const AppTheme: Theme = {
  ...DefaultTheme,
  colors: {
    ...DefaultTheme.colors,
    background: '#ffffff',
  },
};

// 共通スプラッシュ（ローディング）
const Splash = () => (
  <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
    <ActivityIndicator size={Platform.OS === 'web' ? 32 : 'large'} />
  </View>
);

// ゲスト（未ログイン）スタック：制限付きチャット + ログイン/課金導線
const GuestStack = () => (
  <Stack.Navigator screenOptions={{ headerShown: false }}>
    <Stack.Screen name="Chat" component={ChatScreen} />
    <Stack.Screen name="Login" component={LoginScreen} />
    <Stack.Screen name="Subscribe" component={SubscriptionScreen} />
  </Stack.Navigator>
);

// 無料会員スタック：チャット + サブスク画面
const FreeStack = () => (
  <Stack.Navigator screenOptions={{ headerShown: false }}>
    <Stack.Screen name="Chat" component={ChatScreen} />
    <Stack.Screen name="Subscribe" component={SubscriptionScreen} />
  </Stack.Navigator>
);

// 有料会員スタック：必要に応じて Pro 専用画面をここへ追加
const ProStack = () => (
  <Stack.Navigator screenOptions={{ headerShown: false }}>
    <Stack.Screen name="Chat" component={ChatScreen} />
    {/* 例：
    <Stack.Screen name="ProDashboard" component={ProDashboard} />
    <Stack.Screen name="ModelSettings" component={ModelSettingsScreen} />
    <Stack.Screen name="KnowledgeBase" component={KnowledgeBaseScreen} />
    <Stack.Screen name="Files" component={FilesScreen} />
    <Stack.Screen name="Usage" component={UsageScreen} />
    <Stack.Screen name="Billing" component={BillingScreen} />
    */}
    <Stack.Screen name="Subscribe" component={SubscriptionScreen} />
  </Stack.Navigator>
);

// 中枢ナビゲーション：認証 + サブスク tier でルートを出し分け
export const Navigation: React.FC = () => {
  const { loaded: authLoaded, signedIn } = useAuth();
  const { loaded: subLoaded, tier } = useEntitlements();

  // Amplify 初期化/セッション・tier 取得完了まで待機
  if (!authLoaded || !subLoaded) return <Splash />;

  return (
    <NavigationContainer theme={AppTheme}>
      {!signedIn ? (
        <GuestStack />
      ) : tier === 'pro' ? (
        <ProStack />
      ) : (
        <FreeStack />
      )}
    </NavigationContainer>
  );
};