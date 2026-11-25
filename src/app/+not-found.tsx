import { Link } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Colors } from '@/constants/theme';

export default function NotFoundScreen() {
  const colors = Colors.light;

  return (
    <SafeAreaView
      edges={['bottom', 'left', 'right']}
      style={[styles.container, { backgroundColor: colors.background }]}
    >
      <View style={styles.content}>
        <Text style={[styles.message, { color: colors.text }]}>요청한 페이지가 없습니다.</Text>
        <Link href="/" replace style={[styles.link, { color: colors.primary }]}>
          홈으로 돌아가기
        </Link>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
  },
  content: {
    alignItems: 'center',
    gap: 12,
    padding: 24,
  },
  message: {
    fontSize: 18,
    textAlign: 'center',
  },
  link: {
    fontSize: 16,
    lineHeight: 24,
    padding: 12,
  },
});
