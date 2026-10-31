"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";

type BrowserSpeechRecognitionAlternative = {
  transcript: string;
};

type BrowserSpeechRecognitionResult = {
  isFinal: boolean;
  length: number;
  [index: number]: BrowserSpeechRecognitionAlternative;
};

type BrowserSpeechRecognitionResultList = {
  length: number;
  [index: number]: BrowserSpeechRecognitionResult;
};

type BrowserSpeechRecognitionEvent = Event & {
  resultIndex: number;
  results: BrowserSpeechRecognitionResultList;
};

type BrowserSpeechRecognitionErrorEvent = Event & {
  error: string;
};

type BrowserSpeechRecognition = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  start: () => void;
  stop: () => void;
  abort: () => void;
  onstart: (() => void) | null;
  onend: (() => void) | null;
  onresult: ((event: BrowserSpeechRecognitionEvent) => void) | null;
  onerror: ((event: BrowserSpeechRecognitionErrorEvent) => void) | null;
};

type BrowserSpeechRecognitionConstructor = new () => BrowserSpeechRecognition;

type SpeechRecognitionWindow = Window &
  typeof globalThis & {
    SpeechRecognition?: BrowserSpeechRecognitionConstructor;
    webkitSpeechRecognition?: BrowserSpeechRecognitionConstructor;
  };

function getSpeechRecognitionConstructor() {
  if (typeof window === "undefined") {
    return null;
  }

  const speechWindow = window as SpeechRecognitionWindow;

  return (
    speechWindow.SpeechRecognition ??
    speechWindow.webkitSpeechRecognition ??
    null
  );
}

function getSpeechRecognitionErrorMessage(error: string) {
  if (error === "not-allowed" || error === "service-not-allowed") {
    return "Impossible d'utiliser le microphone. V\u00e9rifie l'autorisation du navigateur.";
  }

  if (error === "no-speech") {
    return "Aucune parole d\u00e9tect\u00e9e. R\u00e9essaie avec une commande courte.";
  }

  if (error === "audio-capture") {
    return "Aucun microphone disponible sur cet appareil.";
  }

  return "Erreur de reconnaissance vocale. Reessaie dans quelques instants.";
}

const subscribeToSpeechSupport = () => () => {};
const getSpeechSupport = () => Boolean(getSpeechRecognitionConstructor());
const getServerSpeechSupport = () => false;

export function useSpeechRecognition(onTranscript?: (transcript: string) => void) {
  const recognitionRef = useRef<BrowserSpeechRecognition | null>(null);
  const lastTranscriptRef = useRef("");
  const isSupported = useSyncExternalStore(subscribeToSpeechSupport, getSpeechSupport, getServerSpeechSupport);
  const [isListening, setIsListening] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    return () => {
      recognitionRef.current?.abort();
      recognitionRef.current = null;
    };
  }, []);

  const resetError = useCallback(() => {
    setError(null);
  }, []);

  const stopListening = useCallback(() => {
    recognitionRef.current?.stop();
    setIsListening(false);
  }, []);

  const startListening = useCallback(() => {
    const SpeechRecognitionConstructor = getSpeechRecognitionConstructor();

    if (!SpeechRecognitionConstructor) {
      setError("Reconnaissance vocale non disponible sur ce navigateur.");
      setIsListening(false);
      return;
    }

    recognitionRef.current?.abort();

    const recognition = new SpeechRecognitionConstructor();

    recognition.lang = "fr-FR";
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;
    recognition.onstart = () => {
      setError(null);
      setIsListening(true);
    };
    recognition.onend = () => {
      setIsListening(false);
    };
    recognition.onerror = (event) => {
      setError(getSpeechRecognitionErrorMessage(event.error));
      setIsListening(false);
    };
    recognition.onresult = (event) => {
      const recognizedParts: string[] = [];

      for (let index = event.resultIndex; index < event.results.length; index += 1) {
        const result = event.results[index];
        const alternative = result[0];

        if (result.isFinal && alternative?.transcript) {
          recognizedParts.push(alternative.transcript);
        }
      }

      const finalTranscript = recognizedParts.join(" ").trim();

      if (finalTranscript) {
        setTranscript(finalTranscript);
        if (lastTranscriptRef.current !== finalTranscript) {
          lastTranscriptRef.current = finalTranscript;
          onTranscript?.(finalTranscript);
        }
      }
    };

    recognitionRef.current = recognition;

    try {
      recognition.start();
    } catch {
      setError("Impossible de d\u00e9marrer la reconnaissance vocale.");
      setIsListening(false);
    }
  }, [onTranscript]);

  return {
    isSupported,
    isListening,
    transcript,
    error,
    startListening,
    stopListening,
    resetError,
  };
}
