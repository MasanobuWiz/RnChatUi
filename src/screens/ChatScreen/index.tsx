import React from 'react';
import { View, ImageBackground, Image, Text } from 'react-native';
import { ChatArea } from '../../components/layout/ChatArea';
import { useChat } from '../../hooks/useChat';
import { styles } from './styles';

// 画像は file-loader により URL 文字列として解決される
import BambooBackgroundUrl from '../../../assets/bamboo-background.png';
import WaterDropUrl from '../../../assets/water-drop.png';

// React Native の Image 系は { uri: string } を要求するためラップする
const BambooBackground = { uri: BambooBackgroundUrl } as const;
const WaterDrop = { uri: WaterDropUrl } as const;

export const ChatScreen: React.FC = () => {
  const { messages, input, setInput, sendMessage, isLoading } = useChat();

  return (
    <View style={styles.mainArea}>
      {/* ヘッダーセクション */}
      <View style={styles.headerSection}>
        <ImageBackground
          source={BambooBackground}
          style={styles.headerBackground}
          imageStyle={styles.headerImageStyle}
          resizeMode="cover"
        >
          <View style={styles.headerOverlay}>
            <Image source={WaterDrop} style={styles.character} resizeMode="contain" />
            <View style={styles.descriptionBox}>
              <Text style={styles.welcomeText}>
                私はアクアです。CopilotのUXスペシャリストです。
              </Text>
              <Text style={styles.subWelcomeText}>
                一緒に学んだり、創造したり、何でも話し合ったりできます。
                {'\n'}
                Copilotは間違える場合があります。会話はパーソナライズされ、AIのトレーニングにも利用されます。
              </Text>
            </View>
          </View>
        </ImageBackground>
      </View>

      {/* チャットエリア */}
      <ChatArea
        messages={messages}
        input={input}
        onInputChange={setInput}
        onSend={sendMessage}
        isLoading={isLoading}
      />
    </View>
  );
};
