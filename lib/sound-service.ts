import { Audio, AVPlaybackStatus } from "expo-av";

// Синглтон для управления звуками
class SoundService {
  private static instance: SoundService;
  private ringtoneSound: Audio.Sound | null = null;
  private dialingSound: Audio.Sound | null = null;
  private isRingtonePlaying = false;
  private isDialingPlaying = false;

  private constructor() {}

  static getInstance(): SoundService {
    if (!SoundService.instance) {
      SoundService.instance = new SoundService();
    }
    return SoundService.instance;
  }

  // Настройка аудио режима для звонков
  async setupAudioMode(): Promise<void> {
    try {
      await Audio.setAudioModeAsync({
        allowsRecordingIOS: true,
        playsInSilentModeIOS: true,
        staysActiveInBackground: true,
        shouldDuckAndroid: false,
        playThroughEarpieceAndroid: false,
      });
      console.log("Audio mode configured successfully");
    } catch (error) {
      console.error("Error setting audio mode:", error);
    }
  }

  // Воспроизведение рингтона для входящего звонка
  async playRingtone(): Promise<void> {
    if (this.isRingtonePlaying) {
      console.log("Ringtone already playing");
      return;
    }

    try {
      await this.stopRingtone();
      await this.setupAudioMode();

      console.log("Loading ringtone from local file...");
      
      // Используем локальный файл рингтона
      const { sound } = await Audio.Sound.createAsync(
        require("@/assets/sounds/ringtone.mp3"),
        { 
          isLooping: true, 
          volume: 1.0,
          shouldPlay: false,
        }
      );

      this.ringtoneSound = sound;
      
      // Слушаем статус
      sound.setOnPlaybackStatusUpdate((status: AVPlaybackStatus) => {
        if (!status.isLoaded) {
          this.isRingtonePlaying = false;
        }
      });

      await sound.playAsync();
      this.isRingtonePlaying = true;
      console.log("Ringtone started playing successfully");
    } catch (error) {
      console.error("Error playing ringtone:", error);
      this.isRingtonePlaying = false;
    }
  }

  // Остановка рингтона
  async stopRingtone(): Promise<void> {
    try {
      if (this.ringtoneSound) {
        const status = await this.ringtoneSound.getStatusAsync();
        if (status.isLoaded) {
          await this.ringtoneSound.stopAsync();
          await this.ringtoneSound.unloadAsync();
        }
      }
    } catch (error) {
      // Игнорируем ошибки - звук мог быть уже выгружен
      console.log("Ringtone stop - already unloaded or error");
    } finally {
      this.ringtoneSound = null;
      this.isRingtonePlaying = false;
    }
  }

  // Воспроизведение звука набора (для исходящего звонка)
  async playDialingTone(): Promise<void> {
    if (this.isDialingPlaying) return;

    try {
      await this.stopDialingTone();
      await this.setupAudioMode();

      // Используем тот же рингтон для набора
      const { sound } = await Audio.Sound.createAsync(
        require("@/assets/sounds/ringtone.mp3"),
        {
          isLooping: true,
          volume: 0.5,
          shouldPlay: true,
        }
      );

      this.dialingSound = sound;
      this.isDialingPlaying = true;
      console.log("Dialing tone started");
    } catch (error) {
      console.error("Error playing dialing tone:", error);
    }
  }

  // Остановка звука набора
  async stopDialingTone(): Promise<void> {
    try {
      if (this.dialingSound) {
        const status = await this.dialingSound.getStatusAsync();
        if (status.isLoaded) {
          await this.dialingSound.stopAsync();
          await this.dialingSound.unloadAsync();
        }
      }
    } catch (error) {
      // Игнорируем
    } finally {
      this.dialingSound = null;
      this.isDialingPlaying = false;
    }
  }

  // Остановить все звуки
  async stopAllSounds(): Promise<void> {
    await Promise.all([
      this.stopRingtone(),
      this.stopDialingTone(),
    ]);
  }

  // Проверка воспроизведения
  isPlaying(): boolean {
    return this.isRingtonePlaying || this.isDialingPlaying;
  }
}

export const soundService = SoundService.getInstance();
