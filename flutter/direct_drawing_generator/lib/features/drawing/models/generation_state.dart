/// AI画像生成の状態を表す列挙型
enum GenerationState {
  /// アイドル状態（生成が開始されていない）
  idle,

  /// アップロード中
  uploading,

  /// 生成リクエストを送信中
  submitting,

  /// 生成処理中（ポーリング中）
  generating,

  /// 生成完了
  completed,

  /// エラー発生
  error,
}