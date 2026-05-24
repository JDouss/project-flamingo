import { useState, useEffect } from 'react';
import { X, Key, UploadCloud, FileAudio, AlertTriangle, Sparkles, Check, Loader2, Volume2, ArrowRight } from 'lucide-react';
import { db, storage } from '../firebase';
import { collection, addDoc, getDocs, query, orderBy, deleteDoc, doc } from 'firebase/firestore';
import { ref, uploadBytesResumable, getDownloadURL } from 'firebase/storage';
import { renderMarkdown } from '../utils/markdown';

export default function VoiceAssistant({ isOpen, onClose, onApplyNotes, isDemoMode, bookId, books = [], onApplyNotesToBook }) {
  const [apiKey, setApiKey] = useState(() => {
    return localStorage.getItem('flamingo_gemini_api_key') || '';
  });
  const [saveKey, setSaveKey] = useState(true);
  const [showKeyInput, setShowKeyInput] = useState(() => {
    return !localStorage.getItem('flamingo_gemini_api_key');
  });
  
  // File state
  const [audioFile, setAudioFile] = useState(null);
  const [dragging, setDragging] = useState(false);
  
  // Processing states
  const [status, setStatus] = useState('idle'); // idle, reading, uploading, analyzing, success, error
  const [progressMsg, setProgressMsg] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  
  // Results
  const [analysisResult, setAnalysisResult] = useState(null);
  const [selectedSpeakerId, setSelectedSpeakerId] = useState(null);
  const [expectedSpeakers, setExpectedSpeakers] = useState('auto');
  const [targetBookId, setTargetBookId] = useState('');

  // Raw API Recovery states
  const [rawResponse, setRawResponse] = useState('');
  const [editableRawResponse, setEditableRawResponse] = useState('');
  const [showRawEditor, setShowRawEditor] = useState(false);

  // Tab view states
  const [activeTab, setActiveTab] = useState('new'); // new, history
  const [uploadedAudioUrl, setUploadedAudioUrl] = useState('');
  const [history, setHistory] = useState([]);
  const [loadingHistory, setLoadingHistory] = useState(false);

  // Fetch History
  const fetchHistory = async () => {
    setLoadingHistory(true);
    try {
      if (!isDemoMode) {
        const transcriptionsRef = collection(db, 'transcriptions');
        const q = query(transcriptionsRef, orderBy('createdAt', 'desc'));
        const querySnapshot = await getDocs(q);
        const list = querySnapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        }));
        setHistory(list);
      } else {
        const list = JSON.parse(localStorage.getItem('flamingo_transcription_history') || '[]');
        setHistory(list);
      }
    } catch (err) {
      console.error("Error al cargar el historial:", err);
    } finally {
      setLoadingHistory(false);
    }
  };

  // Load history when modal opens or tab changes
  useEffect(() => {
    if (isOpen) {
      fetchHistory();
    }
  }, [isOpen, activeTab, isDemoMode]);

  if (!isOpen) return null;

  // Key handlers
  const handleKeySave = (e) => {
    e.preventDefault();
    if (saveKey) {
      localStorage.setItem('flamingo_gemini_api_key', apiKey.trim());
    } else {
      localStorage.removeItem('flamingo_gemini_api_key');
    }
    setShowKeyInput(false);
  };

  const clearSavedKey = () => {
    localStorage.removeItem('flamingo_gemini_api_key');
    setApiKey('');
    setShowKeyInput(true);
  };

  // Drag and drop handlers
  const handleDragOver = (e) => {
    e.preventDefault();
    setDragging(true);
  };

  const handleDragLeave = () => {
    setDragging(false);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      validateAndSetFile(e.dataTransfer.files[0]);
    }
  };

  const handleFileChange = (e) => {
    if (e.target.files && e.target.files[0]) {
      validateAndSetFile(e.target.files[0]);
    }
    e.target.value = ''; // Reset value to allow re-uploading the same file
  };

  const getGeminiMimeType = (file) => {
    const ext = file.name.toLowerCase().split('.').pop();
    switch (ext) {
      case 'mp3':
        return 'audio/mp3';
      case 'wav':
        return 'audio/wav';
      case 'm4a':
        return 'audio/m4a';
      case 'ogg':
        return 'audio/ogg';
      default:
        return file.type || 'audio/mp3';
    }
  };

  const validateAndSetFile = (file) => {
    console.log("Selected file:", file.name, "type:", file.type, "size:", file.size);
    setErrorMsg('');
    const fileNameLower = file.name.toLowerCase();
    const isAudioType = file.type && file.type.startsWith('audio/');
    const hasAudioExt = 
      fileNameLower.endsWith('.mp3') || 
      fileNameLower.endsWith('.wav') || 
      fileNameLower.endsWith('.m4a') || 
      fileNameLower.endsWith('.ogg');

    if (!isAudioType && !hasAudioExt) {
      console.warn("Rejected file selection (unsupported extension/mime):", file.name, file.type);
      setErrorMsg('Por favor, sube un archivo de audio válido (.mp3, .wav, .m4a o .ogg).');
      return;
    }
    setAudioFile(file);
  };

  // Convert file to Base64 helper
  const fileToBase64 = (file) => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = () => {
        const base64String = reader.result.split(',')[1];
        resolve(base64String);
      };
      reader.onerror = (error) => reject(error);
    });
  };

  // Helper to save transcription
  const saveTranscription = async (parsedResult, audioUrl) => {
    const transcriptionData = {
      bookId: bookId || 'new_book',
      audioName: audioFile ? audioFile.name : 'audio_grabacion.mp3',
      audioUrl: audioUrl || '',
      result: parsedResult,
      createdAt: new Date().toISOString()
    };

    try {
      if (!isDemoMode) {
        await addDoc(collection(db, 'transcriptions'), transcriptionData);
      } else {
        const currentHistory = JSON.parse(localStorage.getItem('flamingo_transcription_history') || '[]');
        currentHistory.unshift(transcriptionData);
        localStorage.setItem('flamingo_transcription_history', JSON.stringify(currentHistory));
      }
      fetchHistory(); // Refresh history
    } catch (err) {
      console.error("Error al guardar la transcripción en el historial:", err);
    }
  };

  // Run the analysis using Gemini 2.5 Flash
  const handleAnalyzeAudio = async () => {
    if (!apiKey.trim()) {
      setErrorMsg('Por favor, ingresa una clave API de Gemini válida para continuar.');
      setShowKeyInput(true);
      return;
    }
    if (!audioFile) {
      setErrorMsg('Por favor, sube una grabación de audio primero.');
      return;
    }

    setStatus('reading');
    setProgressMsg('Leyendo y preparando el archivo de audio...');
    setErrorMsg('');
    setRawResponse('');
    setEditableRawResponse('');
    setShowRawEditor(false);
    setUploadedAudioUrl('');

    try {
      // 1. Upload audio file to storage if not in demo mode
      let audioUrl = '';
      if (!isDemoMode) {
        setStatus('uploading');
        setProgressMsg('Subiendo archivo de audio a Firebase Storage...');
        try {
          const storageRef = ref(storage, `recordings/${Date.now()}_${audioFile.name}`);
          const uploadTask = uploadBytesResumable(storageRef, audioFile);

          await new Promise((resolve, reject) => {
            uploadTask.on(
              'state_changed',
              (snapshot) => {
                const progress = Math.round((snapshot.bytesTransferred / snapshot.totalBytes) * 100);
                setProgressMsg(`Subiendo audio... ${progress}%`);
              },
              (error) => {
                console.error("Audio upload error:", error);
                reject(error);
              },
              async () => {
                try {
                  audioUrl = await getDownloadURL(uploadTask.snapshot.ref);
                  resolve();
                } catch (err) {
                  reject(err);
                }
              }
            );
          });
        } catch (storageError) {
          console.warn("Storage upload failed, falling back to local Object URL:", storageError);
          audioUrl = URL.createObjectURL(audioFile);
          setProgressMsg('La subida a Storage falló (reglas de seguridad/conexión). Continuando transcripción con archivo local...');
          await new Promise(resolve => setTimeout(resolve, 2000));
        }
      } else {
        audioUrl = URL.createObjectURL(audioFile);
      }

      setUploadedAudioUrl(audioUrl);

      // 2. Convert file to Base64 for the API request
      setStatus('analyzing');
      setProgressMsg('Subiendo y transcribiendo el audio con Gemini 2.5 Flash... (Esto puede tomar entre 30 y 90 segundos para grabaciones largas)');
      
      const base64Data = await fileToBase64(audioFile);
      
      const expectedSpeakersConstraint = expectedSpeakers === 'auto' 
        ? 'Detecta automáticamente el número de hablantes participando en la conversación.'
        : `El número esperado de hablantes es exactamente ${expectedSpeakers}. Agrupa todos los segmentos de diálogo e hilos de conversación en exactamente ${expectedSpeakers} perfiles de hablante. Evita crear perfiles adicionales por variaciones temporales en el tono de voz, volumen o ruido de fondo; si el estilo de habla, el contexto y la interacción sugieren que es la misma persona, agrúpalos bajo el mismo perfil.`;

      const prompt = `
Eres un secretario experto y analista de clubes de lectura.
Analiza la grabación de audio subida de una reunión de un club de lectura en español.
Realiza la diarización de hablantes, transcribe y resume la discusión.
${expectedSpeakersConstraint}

Debes devolver tu respuesta estrictamente en formato JSON.
El JSON debe cumplir con la siguiente estructura exacta:
{
  "speakers": [
    {
      "id": "Hablante A" (o Hablante 1, Hablante 2, etc.),
      "voiceSnippet": "Una cita directa de 1 frase dicha por este hablante que destaque su perspectiva o estilo de habla en español (ej. 'Yo considero que el final fue muy triste pero necesario.')",
      "summary": "Un resumen de 2 o 3 frases de las opiniones principales de este hablante y sus ideas generales sobre el libro, redactado estrictamente en primera persona singular (ej. 'Yo opiné que...', 'Pienso que...'). No uses la tercera persona.",
      "notesMarkdown": "Un documento detallado y extenso en Markdown (mínimo 200-300 palabras si el audio lo permite) que sirva como Notas Preliminares Privadas muy profundas para recordar mis pensamientos durante la lectura y discusión. Debe capturar toda mi perspectiva como hablante, pensamientos íntimos sobre la lectura, aportaciones e hipótesis discutidas, así como puntos clave de debate, acuerdos o desacuerdos profundos que mantuve con los otros participantes. Debe organizarse obligatoriamente con el siguiente esquema:\n\n# Notas preliminares de [Nombre del Hablante]\n## Mis Impresiones y Pensamientos Clave (en primera persona)\n- Detallar lo que yo pensé o sentí durante la lectura y qué partes me impactaron más.\n## Debates y Puntos de Vista con otros miembros\n- Registrar qué puntos de vista defendieron otros hablantes y en qué estuve de acuerdo o en desacuerdo, detallando la discusión.\n## Ideas y Estructura para mi Reseña Final\n- Mis conclusiones principales y cómo planeo estructurar mis argumentos para la reseña final.\n\nRegla de oro: Escribe esto de manera detallada y rica en información, usando viñetas y texto en negrita, todo estrictamente en primera persona singular ('yo', 'mis notas', 'discutí', 'me pareció')."
    }
  ]
}

REGLA CRÍTICA DE REDACCIÓN: Tanto el "summary" como el "notesMarkdown" de CADA hablante deben redactarse como si fuera la propia persona escribiendo en primera persona singular ("yo", "me pareció", "sugerí", "mis notas"). Está estrictamente prohibido usar la tercera persona (por ejemplo, NO escribas "El hablante piensa...", "Hablante 1 mencionó...").
Asegúrate de que 'notesMarkdown' sea texto Markdown válido y correctamente escapado dentro del JSON. Todo el contenido generado DEBE estar en español. No incluyas ningún envoltorio de markdown como \`\`\`json. Devuelve únicamente el JSON crudo.
`;

      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey.trim()}`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            contents: [
              {
                parts: [
                  {
                    inlineData: {
                      mimeType: getGeminiMimeType(audioFile),
                      data: base64Data
                    }
                  },
                  {
                    text: prompt
                  }
                ]
              }
            ],
            generationConfig: {
              responseMimeType: 'application/json'
            }
          })
        }
      );

      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(errData?.error?.message || `Error de la API (${response.status})`);
      }

      const data = await response.json();
      const textResponse = data?.candidates?.[0]?.content?.parts?.[0]?.text;
      
      if (!textResponse) {
        throw new Error('Se recibió una respuesta vacía de Gemini.');
      }

      // Save raw response immediately so it remains available for recovery if parsing fails
      setRawResponse(textResponse);
      setEditableRawResponse(textResponse);

      // Parse JSON
      const parsedResult = parseGeminiResponse(textResponse);
      if (!parsedResult?.speakers || parsedResult.speakers.length === 0) {
        throw new Error('No se pudo extraer la estructura de hablantes de la respuesta de la API.');
      }

      setAnalysisResult(parsedResult);
      setStatus('success');

      // Save transcription to database/localStorage
      await saveTranscription(parsedResult, audioUrl);
    } catch (err) {
      console.error('Audio processing error:', err);
      setErrorMsg(err.message || 'Ocurrió un error al procesar el audio. Asegúrate de que el archivo pese menos de 20MB y de que tu clave de API sea correcta.');
      setStatus('error');
    }
  };

  const handleSimulate5Speakers = () => {
    const simulatedResult = {
      speakers: [
        {
          id: "Hablante 1 (El Crítico Literario)",
          voiceSnippet: "Yo considero que la estructura gótica de Barcelona no es un mero escenario, sino el personaje central que conecta las tragedias de Julián Carax y Daniel.",
          summary: "Yo opiné que la atmósfera gótica es el verdadero motor de la novela. Destaqué la influencia de autores del siglo XIX y defendí que el Cementerio de los Libros Olvidados representa la memoria histórica de España.",
          notesMarkdown: `# Notas de Hablante 1 (Crítico Literario)\n\n## Mis Impresiones y Pensamientos Clave (en primera persona)\n- **Atmósfera Gótica**: Sostuve que la niebla, la lluvia constante y las mansiones en ruinas de Barcelona simbolizan la opresión y el trauma latente de la posguerra española.\n- **Estructura Narrativa**: Propuse que las tramas paralelas (Daniel/Beatriz y Julián/Penélope) funcionan como un espejo que advierte a Daniel sobre los peligros de repetir la trágica historia de Julián Carax.\n- *Trauma Histórico*: Sugerí que el inspector Fumero personifica el sadismo impune de la dictadura y cómo el dolor colectivo permea todas las relaciones en la obra.\n\n## Debates y Puntos de Vista con otros miembros\n- **Discusión con Hablante 4 (El Escéptico)**: Él argumentó que el libro recurre demasiado al melodrama. Yo discrepé firmemente, señalando que la combinación de romance decimonónico con misterio policíaco es una decisión estilística intencionada de Zafón para rendir homenaje a la literatura de folletín.\n- **Coincidencia con Hablante 3 (Analista Histórico)**: Estuve muy de acuerdo con su lectura sobre cómo el silencio forzado moldea la psicología evasiva de los personajes de la librería.\n\n## Ideas y Estructura para mi Reseña Final\n1. **Introducción**: Iniciar analizando la geografía mística de Barcelona como un reflejo exterior de la desolación interna de los personajes.\n2. **Nudo**: Centrar la reseña en la dualidad de Daniel y Julián, exponiendo cómo el amor por los libros prohibidos funciona como un acto de rebelión cultural contra un régimen opresivo.\n3. **Conclusión**: Cerrar evaluando si la novela ofrece una redención real mediante la escritura o si simplemente gira en un bucle inevitable.`
        },
        {
          id: "Hablante 2 (Lector Emocional)",
          voiceSnippet: "A mí lo que realmente me llegó al corazón fue la lealtad inquebrantable de Fermín; sus diálogos traen luz al relato más oscuro.",
          summary: "Yo me enfoqué en el plano emocional del libro. Expresé que la amistad entre Daniel y Fermín es el alma de la novela, rescatándola de ser una simple tragedia trágica y dándole esperanza.",
          notesMarkdown: `# Notas de Hablante 2 (Lector Emocional)\n\n## Mis Impresiones y Pensamientos Clave (en primera persona)\n- **Lealtad y Luz**: Sentí una profunda conexión con el personaje de Fermín Romero de Torres. Sus ingeniosos comentarios y su lealtad inquebrantable hacia Daniel me parecieron el faro de esperanza en un entorno sumamente sombrío.\n- **Historias de Amor Trágicas**: Lloré con el destino de Penélope y Julián. Me dolió profundamente la revelación de la cripta y el confinamiento de Julián tras el incendio de sus manuscritos.\n\n## Debates y Puntos de Vista con otros miembros\n- **Discusión con Hablante 4 (El Escéptico)**: Él señaló que los personajes femeninos carecen de profundidad propia. Tuve que darle la razón en parte; admití que Beatriz y Penélope a veces parecen musas idealizadas en lugar de mujeres reales con voz propia, aunque defendí que su rol es el de catalizadores emocionales de la historia.\n- **Apoyo de Hablante 5 (El Bibliófilo)**: Coincidimos en que el amor incondicional por la literatura es el verdadero motor de salvación para Daniel.\n\n## Ideas y Estructura para mi Reseña Final\n1. **Introducción**: Centrar la reseña en el poder curativo de la amistad y la lealtad en tiempos de desolación.\n2. **Análisis de Personajes**: Desarrollar un perfil detallado de Fermín, destacando sus citas memorables sobre la vida, el amor y la comida.\n3. **Cierre**: Reflexionar sobre cómo la novela demuestra que el amor y la memoria de las personas que perdimos es lo único que nos protege de convertirnos en 'sombras' sin alma.`
        },
        {
          id: "Hablante 3 (Analista Histórico)",
          voiceSnippet: "No podemos obviar el contexto de la Barcelona de 1945; el miedo en las calles y la censura configuran la timidez de los personajes.",
          summary: "Yo analicé la novela bajo una perspectiva socio-histórica. Argumenté que el ambiente de represión e inseguridad explica la necesidad de los personajes de refugiarse en la literatura.",
          notesMarkdown: `# Notas de Hablante 3 (Analista Histórico)\n\n## Mis Impresiones y Pensamientos Clave (en primera persona)\n- **La Opresión de la Posguerra**: Destaqué la representación precisa que hace Zafón de la Barcelona bajo el franquismo, con la presencia constante de policías corruptos, el miedo a ser denunciado y la cartilla de racionamiento.\n- **La Resistencia Cultural**: Propuse que la librería Sempere funciona como un microcosmos de libertad cultural y resistencia moral silenciosa, donde las ideas prohibidas se protegen físicamente de la quema.\n\n## Debates y Puntos de Vista con otros miembros\n- **Discusión con Hablante 1 (El Crítico)**: Intercambiamos ideas sobre si el Cementerio de los Libros Olvidados tiene un significado místico o puramente político. Yo defendí que es una representación literal de las memorias censuradas y las vidas rotas que el régimen intentaba borrar activamente del mapa nacional.\n- **Encuentro con Hablante 5 (El Bibliófilo)**: Apoyé su idea de que rescatar un libro de la destrucción equivale a rescatar la verdad histórica.\n\n## Ideas y Estructura para mi Reseña Final\n1. **Perspectiva**: Darle un enfoque histórico a la reseña, evaluando la fidelidad de la atmósfera social frente a la realidad de la posguerra española.\n2. **Temática**: Analizar el personaje de Fumero no solo como un monstruo de ficción, sino como un retrato de los oportunistas violentos que se consolidaron en el aparato del Estado.\n3. **Conclusión**: Concluir destacando el libro como un recordatorio del peligro del olvido institucional e histórico.`
        },
        {
          id: "Hablante 4 (El Escéptico)",
          voiceSnippet: "El libro me entretuvo muchísimo, pero encontré algunos giros de guión bastante forzados y personajes femeninos poco desarrollados.",
          summary: "Yo mantuve una postura crítica sobre el ritmo y el desarrollo de ciertos personajes. Aunque reconocí el gancho de la intriga, señalé que Beatriz y Penélope actúan más como ideales que como personas reales.",
          notesMarkdown: `# Notas de Hablante 4 (El Escéptico)\n\n## Mis Impresiones y Pensamientos Clave (en primera persona)\n- **Estructura Predecible**: Aunque disfruté de la lectura rápida, sentí que la novela recurre a demasiados giros melodramáticos de la literatura victoriana de folletín y cartas explicativas de 30 páginas para resolver misterios complejos.\n- **Unidimensionalidad Femenina**: Me molestó que Beatriz Aguilar sirva principalmente como la recompensa romántica de Daniel, sin una motivación interna fuerte o un arco de crecimiento individual.\n\n## Debates y Puntos de Vista con otros miembros\n- **Discusión con Hablante 2 (Lector Emocional)**: Él defendía el final feliz y el valor purificador de las emociones. Yo argumenté que el final parece excesivamente forzado, resolviendo todos los conflictos con demasiada conveniencia y dejando de lado la crudeza trágica que se venía construyendo con la figura de Carax.\n- **Debate con Hablante 1 (El Crítico)**: Él sostenía que el melodrama es deliberado; yo mantuve que, aun si es una elección de género, le resta impacto de obra de arte seria y la acerca más a una novela comercial típica.\n\n## Ideas y Estructura para mi Reseña Final\n1. **Enfoque Crítico**: Escribir una reseña honesta y equilibrada que elogie el ritmo adictivo de la prosa de Zafón, pero que señale los fallos de coherencia y el abuso de los estereotipos de damiselas en apuros.\n2. **Sección Detallada**: Dedicar un párrafo a examinar los recursos narrativos facilones (como la extensa carta final de Nuria Monfort).\n3. **Cierre**: Valorar el libro como una excelente pieza de entretenimiento literario que, no obstante, no debe confundirse con una obra cumbre de la técnica narrativa.`
        },
        {
          id: "Hablante 5 (El Bibliófilo)",
          voiceSnippet: "Para mí, el libro es ante todo un homenaje al objeto físico del libro y al noble oficio de los libreros y encuadernadores.",
          summary: "Yo centré mi intervención en la pasión por los libros que destila la obra. Resalté la relación entre Daniel y su padre, y la veneración del libro como un tesoro sagrado que conecta generaciones.",
          notesMarkdown: `# Notas de Hablante 5 (El Bibliófilo)\n\n## Mis Impresiones y Pensamientos Clave (en primera persona)\n- **El Culto al Libro Físico**: Me conmovió la devoción de Daniel y su padre por los libros como objetos sagrados que contienen almas. Comparto plenamente la idea de que los libros guardan los pedazos de vida de quienes los leyeron.\n- **El Oficio del Librero**: Disfruté enormemente de los pasajes que describen el aroma a papel viejo, el proceso de encuadernación y las conversaciones entre los libreros en la trastienda. Me hizo valorar la mística de un comercio en peligro de extinción en nuestra sociedad digital.\n\n## Debates y Puntos de Vista con otros miembros\n- **Coincidencia con Hablante 2 (Lector Emocional)**: Coincidimos en que el Cementerio de los Libros Olvidados es un espacio mágico que todo lector sueña con visitar, un santuario de la imaginación humana.\n- **Discusión con Hablante 3 (Analista Histórico)**: Analizamos cómo la quema de los libros de Carax simboliza el control mental y la destrucción del libre pensamiento. Ambos estuvimos de acuerdo en que custodiar un libro prohibido es un acto supremo de valentía colectiva.\n\n## Ideas y Estructura para mi Reseña Final\n1. **Tema Central**: Enfocar la reseña como una apología del libro físico y de la lectura activa como un acto sagrado de memoria.\n2. **Estructura**: Dividir el texto analizando primero la simbología del 'Cementerio de los Libros', luego el rol del librero clásico frente al lector moderno, y terminar con un comentario sobre la metaliteratura en la obra.\n3. **Cita Clave**: Utilizar como encabezado la icónica cita del Cementerio de los Libros Olvidados.`
        }
      ]
    };

    setAnalysisResult(simulatedResult);
    setAudioFile({ name: 'Simulacion_Club_Lectura.mp3', size: 14680064 });
    setUploadedAudioUrl('https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3');
    setStatus('success');
    setActiveTab('new');
    setSelectedSpeakerId("Hablante 1 (El Crítico Literario)");
    setTargetBookId('');
  };

  // Helper to parse LLM JSON (strips out potential markdown ticks)
  const parseGeminiResponseFallback = (text) => {
    try {
      const speakers = [];
      const speakerSplits = text.split(/"id"\s*:\s*/i);
      
      for (let i = 1; i < speakerSplits.length; i++) {
        const block = speakerSplits[i];
        
        let id = "";
        const idMatch = block.match(/^\s*"([^"]+)"/);
        if (idMatch) {
          id = idMatch[1];
        } else {
          const idMatchNoQuote = block.match(/^\s*([^,}\n]+)/);
          if (idMatchNoQuote) {
            id = idMatchNoQuote[1].replace(/["']/g, '').trim();
          }
        }
        if (!id) id = `Speaker ${i}`;

        const extractField = (fieldName) => {
          const fieldMarker = new RegExp(`"${fieldName}"\\s*:\\s*"`, 'i');
          const markerMatch = block.match(fieldMarker);
          if (!markerMatch) return "";
          
          const startIdx = markerMatch.index + markerMatch[0].length;
          const subText = block.substring(startIdx);
          
          const nextMarkers = [
            /"voiceSnippet"\s*:/i,
            /"summary"\s*:/i,
            /"notesMarkdown"\s*:/i,
            /"id"\s*:/i,
            /\s*}\s*,?\s*"/,
            /\s*}\s*\]/,
            /\s*}\s*$/
          ];
          
          let endIdx = subText.length;
          for (const marker of nextMarkers) {
            const match = subText.match(marker);
            if (match && match.index < endIdx) {
              endIdx = match.index;
            }
          }
          
          let val = subText.substring(0, endIdx).trim();
          let lastQuoteIdx = val.lastIndexOf('"');
          while (lastQuoteIdx > 0 && val[lastQuoteIdx - 1] === '\\') {
            lastQuoteIdx = val.substring(0, lastQuoteIdx).lastIndexOf('"');
          }
          
          if (lastQuoteIdx !== -1) {
            val = val.substring(0, lastQuoteIdx);
          }
          
          return val
            .replace(/\\"/g, '"')
            .replace(/\\n/g, '\n')
            .replace(/\\t/g, '\t')
            .replace(/\\\\/g, '\\')
            .trim();
        };
        
        const voiceSnippet = extractField("voiceSnippet");
        const summary = extractField("summary");
        const notesMarkdown = extractField("notesMarkdown");
        
        speakers.push({
          id,
          voiceSnippet: voiceSnippet || "Fragmento de transcripción no disponible",
          summary: summary || "Resumen no disponible",
          notesMarkdown: notesMarkdown || "Notas no disponibles"
        });
      }
      
      if (speakers.length > 0) {
        return { speakers };
      }
      return null;
    } catch (err) {
      console.error("Regex fallback parser failed:", err);
      return null;
    }
  };

  const parseGeminiResponse = (text) => {
    let cleaned = text.trim();
    if (cleaned.startsWith('```json')) {
      cleaned = cleaned.substring(7);
    } else if (cleaned.startsWith('```')) {
      cleaned = cleaned.substring(3);
    }
    if (cleaned.endsWith('```')) {
      cleaned = cleaned.substring(0, cleaned.length - 3);
    }
    cleaned = cleaned.trim();
    
    try {
      return JSON.parse(cleaned);
    } catch (jsonErr) {
      console.warn("JSON.parse failed. Attempting fallback regex parsing...", jsonErr);
      const fallbackResult = parseGeminiResponseFallback(cleaned);
      if (fallbackResult) {
        console.log("Successfully recovered structured speaker data using fallback regex parser!");
        return fallbackResult;
      }
      throw jsonErr;
    }
  };

  const handleReparseRaw = async () => {
    setErrorMsg('');
    try {
      const parsedResult = parseGeminiResponse(editableRawResponse);
      if (!parsedResult?.speakers || parsedResult.speakers.length === 0) {
        throw new Error('No se pudo extraer la estructura de hablantes del texto.');
      }
      setAnalysisResult(parsedResult);
      setStatus('success');
      setShowRawEditor(false);

      // Save transcription to database/localStorage
      await saveTranscription(parsedResult, uploadedAudioUrl);
    } catch (err) {
      console.error('Manual reparse failed:', err);
      setErrorMsg(`Error al volver a analizar: ${err.message}. Si el JSON está mal formado, puedes intentar editarlo abajo para corregir los errores de sintaxis.`);
    }
  };

  // Delete history item
  const handleDeleteHistoryItem = async (item) => {
    if (!window.confirm(`¿Estás seguro de que deseas eliminar esta transcripción del historial?`)) {
      return;
    }
    try {
      if (!isDemoMode) {
        await deleteDoc(doc(db, 'transcriptions', item.id));
      } else {
        const currentHistory = JSON.parse(localStorage.getItem('flamingo_transcription_history') || '[]');
        const updatedHistory = currentHistory.filter(h => h.createdAt !== item.createdAt);
        localStorage.setItem('flamingo_transcription_history', JSON.stringify(updatedHistory));
      }
      fetchHistory();
    } catch (err) {
      console.error("Error al eliminar la transcripción del historial:", err);
      alert("Error al eliminar del historial: " + err.message);
    }
  };

  return (
    <>
      <div className="voice-assistant-overlay" onClick={onClose}></div>
      <div className="voice-assistant-modal" onClick={(e) => e.stopPropagation()}>
        
        {/* Header */}
        <div className="voice-assistant-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <Sparkles size={20} style={{ color: 'var(--primary)' }} />
            <h3 className="serif-title" style={{ fontSize: '1.4rem', margin: 0 }}>Asistente de notas de voz</h3>
          </div>
          <button className="voice-close-btn" onClick={onClose}>
            <X size={16} />
          </button>
        </div>

        {/* Navigation Tabs */}
        <div className="voice-tabs">
          <button 
            type="button" 
            className={`voice-tab-btn ${activeTab === 'new' ? 'active' : ''}`}
            onClick={() => setActiveTab('new')}
          >
            Nueva Transcripción
          </button>
          <button 
            type="button" 
            className={`voice-tab-btn ${activeTab === 'history' ? 'active' : ''}`}
            onClick={() => setActiveTab('history')}
          >
            Historial de Transcripciones
          </button>
        </div>

        {/* Modal Body */}
        <div className="voice-assistant-body">
          {errorMsg && (
            <div className="voice-alert-danger">
              <AlertTriangle size={16} style={{ flexShrink: 0 }} />
              <span>{errorMsg}</span>
            </div>
          )}

          {activeTab === 'new' ? (
            <>
              {/* Wallet-saving raw response recovery panel */}
              {rawResponse && status === 'error' && (
                <div style={{
                  marginTop: '1rem',
                  padding: '1rem',
                  border: '1px solid var(--border)',
                  borderRadius: 'var(--radius-sm)',
                  background: 'rgba(214, 130, 134, 0.05)',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '0.75rem'
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <Sparkles size={16} style={{ color: 'var(--primary)' }} />
                    <h5 style={{ fontWeight: '700', fontSize: '0.9rem', margin: 0 }}>Panel de recuperación para evitar costes</h5>
                  </div>
                  <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', lineHeight: '1.4', margin: 0 }}>
                    Obtuvimos con éxito la respuesta de Gemini, pero no se pudo analizar correctamente.
                    Para evitar gastar tu saldo de API, puedes ver el texto sin procesar abajo, corregir errores de tipografía del JSON (como comillas no escapadas) e intentar volver a analizarlo, o bien copiar la transcripción manualmente. No se realizarán nuevas llamadas a la API.
                  </p>
                  
                  <div style={{ display: 'flex', gap: '0.5rem' }}>
                    <button
                      type="button"
                      className="btn btn-secondary"
                      style={{ padding: '0.35rem 0.75rem', fontSize: '0.75rem', height: 'auto' }}
                      onClick={() => setShowRawEditor(!showRawEditor)}
                    >
                      {showRawEditor ? "Ocultar respuesta cruda" : "Ver/Editar respuesta cruda"}
                    </button>
                    {showRawEditor && (
                      <button
                        type="button"
                        className="btn btn-primary"
                        style={{ padding: '0.35rem 0.75rem', fontSize: '0.75rem', height: 'auto', background: 'var(--sage)' }}
                        onClick={handleReparseRaw}
                      >
                        Analizar texto editado
                      </button>
                    )}
                  </div>

                  {showRawEditor && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                      <textarea
                        style={{ 
                          width: '100%', 
                          height: '180px', 
                          fontFamily: 'monospace', 
                          fontSize: '0.75rem', 
                          background: 'var(--bg-secondary)', 
                          border: '1px solid var(--border)', 
                          color: 'var(--text-primary)', 
                          padding: '0.5rem', 
                          borderRadius: 'var(--radius-sm)',
                          resize: 'vertical',
                          lineHeight: '1.4'
                        }}
                        value={editableRawResponse}
                        onChange={(e) => setEditableRawResponse(e.target.value)}
                      />
                      <p style={{ fontSize: '0.7rem', color: 'var(--text-muted)', margin: 0 }}>
                        💡 Consejo: Busca comas faltantes entre parámetros o comillas sin escapar como <code>"voiceSnippet": "Dije "hola""</code> (cámbialo a <code>\"hola\"</code>).
                      </p>
                    </div>
                  )}
                </div>
              )}

              {/* 1. API Key Config Section */}
              {showKeyInput ? (
                <form onSubmit={handleKeySave} className="voice-key-form">
                  <div className="form-group">
                    <label className="form-label" style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                      <Key size={14} /> Clave API de Gemini
                    </label>
                    <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '0.5rem' }}>
                      Tu clave se almacena de forma segura en el almacenamiento local de tu navegador y nunca se envía a nuestros servidores. Obtén una clave gratuita en <a href="https://aistudio.google.com/" target="_blank" rel="noopener noreferrer" style={{ color: 'var(--primary)', textDecoration: 'underline' }}>Google AI Studio</a>.
                    </p>
                    <input
                      type="password"
                      required
                      className="form-input"
                      placeholder="AIzaSy..."
                      value={apiKey}
                      onChange={(e) => setApiKey(e.target.value)}
                    />
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: '1rem' }}>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.85rem', color: 'var(--text-muted)', cursor: 'pointer' }}>
                      <input
                        type="checkbox"
                        checked={saveKey}
                        onChange={(e) => setSaveKey(e.target.checked)}
                      />
                      Guardar clave en este navegador
                    </label>
                    <button type="submit" className="btn btn-primary" style={{ padding: '0.4rem 1rem' }}>
                      Guardar y continuar
                    </button>
                  </div>
                </form>
              ) : (
                <div className="voice-key-badge">
                  <span style={{ fontSize: '0.8rem', color: 'var(--sage)', fontWeight: '600', display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                    <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: 'var(--sage)' }}></span>
                    Gemini API configurada
                  </span>
                  <button 
                    type="button" 
                    onClick={clearSavedKey} 
                    style={{ background: 'none', border: 'none', color: 'var(--primary)', fontSize: '0.8rem', cursor: 'pointer', textDecoration: 'underline' }}
                  >
                    Cambiar clave
                  </button>
                </div>
              )}

              {/* 2. File Upload / Processing State */}
              {status === 'idle' || status === 'error' ? (
                <div style={{ marginTop: '1.5rem' }}>
                  <label className="form-label">Subir audio del club de lectura</label>
                  <div
                    className={`voice-upload-zone ${dragging ? 'dragging' : ''}`}
                    onDragOver={handleDragOver}
                    onDragLeave={handleDragLeave}
                    onDrop={handleDrop}
                    onClick={() => document.getElementById('voice-audio-input').click()}
                  >
                    <UploadCloud className="voice-upload-icon" />
                    {audioFile ? (
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--text-primary)' }}>
                        <FileAudio size={18} style={{ color: 'var(--primary)' }} />
                        <span style={{ fontWeight: '600', fontSize: '0.9rem' }}>{audioFile.name}</span>
                        <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>({(audioFile.size / (1024 * 1024)).toFixed(2)} MB)</span>
                      </div>
                    ) : (
                      <>
                        <p style={{ fontSize: '0.9rem', fontWeight: '600' }}>
                          Arrastra y suelta la grabación de la reunión aquí, o <span style={{ color: 'var(--primary)' }}>busca un archivo</span>
                        </p>
                        <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                          Formatos soportados: MP3, WAV, M4A, OGG
                        </p>
                      </>
                    )}
                  </div>
                  <input
                    id="voice-audio-input"
                    type="file"
                    accept="audio/*,.mp3,.wav,.m4a,.ogg,audio/mpeg,audio/mp3,audio/wav,audio/x-wav,audio/m4a,audio/x-m4a,audio/ogg"
                    style={{ display: 'none' }}
                    onChange={handleFileChange}
                  />

                  {/* Speaker Diarization expected speakers selection */}
                  {audioFile && (
                    <div style={{ marginTop: '1.25rem', marginBottom: '0.5rem', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                      <label className="form-label" style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.85rem' }}>
                        <Volume2 size={14} /> Número de hablantes esperado
                      </label>
                      <select
                        className="form-select"
                        value={expectedSpeakers}
                        onChange={(e) => setExpectedSpeakers(e.target.value)}
                        style={{ width: '100%', background: 'var(--bg-secondary)', color: 'var(--text-primary)', borderColor: 'var(--border)' }}
                      >
                        <option value="auto">Automático (Detectar automáticamente)</option>
                        <option value="1">1 hablante</option>
                        <option value="2">2 hablantes</option>
                        <option value="3">3 hablantes</option>
                        <option value="4">4 hablantes</option>
                        <option value="5">5 hablantes</option>
                        <option value="6">6 o más hablantes</option>
                      </select>
                    </div>
                  )}

                  {/* Compression Notice */}
                  <div className="voice-notice-box">
                    <AlertTriangle size={14} style={{ flexShrink: 0, color: 'var(--clay)', marginTop: '0.1rem' }} />
                    <div>
                      <p style={{ fontWeight: '600', color: 'var(--clay)', fontSize: '0.8rem', marginBottom: '0.2rem' }}>Recomendación de tamaño de archivo</p>
                      <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', lineHeight: '1.4' }}>
                        La subida directa desde el navegador está limitada a **20MB**. Para reuniones del club de lectura de 1 a 2 horas, recomendamos exportar el audio como **MP3 mono de 32 kbps** (¡una hora de audio ocupará solo unos 14MB, lo cual se procesa perfectamente y cuesta menos de 10 centavos!).
                      </p>
                    </div>
                  </div>

                  {audioFile && (
                    <button
                      type="button"
                      className="btn btn-primary"
                      onClick={handleAnalyzeAudio}
                      style={{ width: '100%', marginTop: '1.5rem', display: 'flex', gap: '0.5rem', justifyContent: 'center' }}
                    >
                      <Sparkles size={16} /> Iniciar transcripción y análisis por IA
                    </button>
                  )}

                  {/* Option to simulate 5 speakers */}
                  <div style={{
                    marginTop: '1.5rem',
                    padding: '1rem',
                    border: '1px dashed var(--primary)',
                    borderRadius: 'var(--radius-md)',
                    background: 'rgba(89, 178, 146, 0.04)',
                    textAlign: 'center',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    gap: '0.5rem'
                  }}>
                    <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', margin: 0 }}>
                      🧪 ¿Quieres probar la interfaz con múltiples hablantes y audio inmediatamente?
                    </p>
                    <button
                      type="button"
                      className="btn btn-secondary"
                      onClick={handleSimulate5Speakers}
                      style={{ 
                        fontSize: '0.8rem', 
                        padding: '0.4rem 1rem', 
                        borderColor: 'var(--primary)', 
                        color: 'var(--primary)',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.35rem',
                        cursor: 'pointer'
                      }}
                    >
                      <Sparkles size={12} /> Simular conversación con 5 Hablantes
                    </button>
                  </div>
                </div>
              ) : (status === 'reading' || status === 'uploading' || status === 'analyzing') ? (
                <div className="voice-processing-box">
                  <Loader2 className="voice-spinner" size={32} />
                  <p style={{ fontWeight: '600', fontSize: '1rem', marginTop: '1rem' }}>Procesando grabación</p>
                  <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', textAlign: 'center', maxWidth: '340px', marginTop: '0.25rem' }}>
                    {progressMsg}
                  </p>
                </div>
              ) : status === 'success' && analysisResult ? (
                <div style={{ marginTop: '1.5rem' }}>
                  {/* Audio Player playback box */}
                  {uploadedAudioUrl && (
                    <div style={{
                      background: 'var(--bg-secondary)',
                      padding: '0.75rem 1rem',
                      borderRadius: 'var(--radius-sm)',
                      border: '1px solid var(--border)',
                      marginBottom: '1.25rem',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '0.35rem',
                      textAlign: 'left'
                    }}>
                      <p style={{ fontSize: '0.75rem', fontWeight: 'bold', color: 'var(--text-muted)', margin: 0, display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                        <Volume2 size={14} /> REPRODUCIENDO GRABACIÓN ASOCIADA
                      </p>
                      <audio src={uploadedAudioUrl} controls style={{ width: '100%' }} />
                    </div>
                  )}

                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                    <h4 className="serif-title" style={{ fontSize: '1.2rem', margin: 0, textAlign: 'center', width: '100%' }}>
                      ¿Quién eres tú en esta grabación?
                    </h4>
                  </div>
                  
                  <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '1.25rem', textAlign: 'center' }}>
                    Selecciona tu perfil de hablante abajo para revisar sus opiniones y ver/copiar sus notas detalladas.
                  </p>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                    {analysisResult.speakers.map((speaker) => {
                      const isSelected = selectedSpeakerId === speaker.id;
                      // Display number or letter indicator
                      const avatarText = speaker.id.match(/\d+/) 
                        ? speaker.id.match(/\d+/)[0] 
                        : (speaker.id.match(/[A-Z]/) ? speaker.id.match(/[A-Z]/)[0] : 'S');

                      return (
                        <div 
                          key={speaker.id} 
                          className={`voice-speaker-card ${isSelected ? 'selected' : ''}`}
                          onClick={() => setSelectedSpeakerId(speaker.id)}
                          style={{ cursor: 'pointer', border: isSelected ? '1px solid var(--primary)' : '1px solid var(--border)' }}
                        >
                          <div className="voice-speaker-header">
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                              <div className={`voice-speaker-avatar ${isSelected ? 'active' : ''}`}>
                                {avatarText}
                              </div>
                              <div style={{ textAlign: 'left' }}>
                                <p style={{ fontWeight: '700', fontSize: '0.95rem', margin: 0 }}>{speaker.id}</p>
                                <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', margin: 0 }}>Participante del club de lectura</p>
                              </div>
                            </div>
                            {isSelected && (
                              <span className="voice-badge-applied">
                                <Check size={12} /> Seleccionado
                              </span>
                            )}
                          </div>

                          {/* Voice snippet */}
                          <div className="voice-speaker-snippet" style={{ textAlign: 'left' }}>
                            <Volume2 size={14} style={{ color: 'var(--primary)', flexShrink: 0, marginTop: '0.2rem' }} />
                            <span style={{ fontStyle: 'italic', fontSize: '0.85rem' }}>
                              “{speaker.voiceSnippet}”
                            </span>
                          </div>

                          {/* Summary */}
                          <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)', lineHeight: '1.5', margin: '0.75rem 0', textAlign: 'left' }}>
                            <strong>Opiniones clave (en primera persona):</strong> {speaker.summary}
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  {/* Notes Markdown Preview Container */}
                  {selectedSpeakerId && (
                    <div style={{
                      marginTop: '1.5rem',
                      padding: '1.25rem',
                      border: '1px solid var(--border)',
                      borderRadius: 'var(--radius-md)',
                      background: '#FAF6EE', // light soft cream
                      boxShadow: 'var(--shadow-sm)',
                      textAlign: 'left'
                    }}>
                      <h5 className="serif-title" style={{ fontSize: '1.15rem', marginBottom: '0.75rem', color: 'var(--primary)', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <Sparkles size={16} /> Notas preliminares privadas de {selectedSpeakerId}
                      </h5>
                      
                      <div className="voice-notes-markdown-preview" style={{
                        maxHeight: '350px',
                        overflowY: 'auto',
                        padding: '1rem',
                        background: '#ffffff',
                        border: '1px solid var(--border)',
                        borderRadius: 'var(--radius-sm)',
                        fontSize: '0.875rem',
                        lineHeight: '1.6',
                        marginBottom: '1rem',
                        color: 'var(--text-primary)'
                      }}>
                        {renderMarkdown(analysisResult.speakers.find(s => s.id === selectedSpeakerId)?.notesMarkdown || '')}
                      </div>

                      <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
                        <button
                          type="button"
                          className="btn btn-secondary"
                          style={{ padding: '0.4rem 0.8rem', fontSize: '0.8rem', height: 'auto' }}
                          onClick={() => {
                            const markdown = analysisResult.speakers.find(s => s.id === selectedSpeakerId)?.notesMarkdown;
                            if (markdown) {
                              navigator.clipboard.writeText(markdown);
                              alert("¡Notas copiadas al portapapeles con éxito!");
                            }
                          }}
                        >
                          Copiar al portapapeles
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Select Book Dropdown (General View Mode) */}
                  {selectedSpeakerId && !onApplyNotes && books && books.length > 0 && (
                    <div style={{
                      marginTop: '1.5rem',
                      padding: '1.25rem',
                      border: '1px solid var(--border)',
                      borderRadius: 'var(--radius-md)',
                      background: 'var(--bg-secondary)',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '0.5rem',
                      textAlign: 'left'
                    }}>
                      <label className="form-label" style={{ fontSize: '0.85rem', margin: 0, fontWeight: 'bold' }}>
                        Aplicar estas notas a una reseña existente:
                      </label>
                      <div style={{ display: 'flex', gap: '0.5rem' }}>
                        <select
                          className="form-select"
                          value={targetBookId}
                          onChange={(e) => setTargetBookId(e.target.value)}
                          style={{ flex: 1, fontSize: '0.85rem', background: 'var(--bg-card)', color: 'var(--text-primary)', borderColor: 'var(--border)' }}
                        >
                          <option value="">-- Seleccionar reseña de libro --</option>
                          {books.map(b => (
                            <option key={b.id} value={b.id}>{b.title} - {b.author}</option>
                          ))}
                        </select>
                        <button
                          type="button"
                          className="btn btn-primary"
                          disabled={!targetBookId}
                          style={{ padding: '0.5rem 1.25rem', height: 'auto', fontSize: '0.85rem' }}
                          onClick={async () => {
                            const markdown = analysisResult.speakers.find(s => s.id === selectedSpeakerId)?.notesMarkdown;
                            if (markdown && targetBookId && onApplyNotesToBook) {
                              try {
                                await onApplyNotesToBook(targetBookId, markdown);
                                alert("Notas de voz aplicadas con éxito al libro.");
                                onClose();
                              } catch (err) {
                                alert("Error al aplicar las notas: " + err.message);
                              }
                            }
                          }}
                        >
                          Aplicar a Reseña
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Bottom Action buttons */}
                  <div style={{ marginTop: '2rem', display: 'flex', flexDirection: 'column', gap: '0.5rem', alignItems: 'center' }}>
                    {onApplyNotes && (
                      <button
                        type="button"
                        className="btn btn-primary"
                        style={{ width: '100%', maxWidth: '320px', display: 'flex', gap: '0.5rem', justifyContent: 'center', alignItems: 'center' }}
                        disabled={!selectedSpeakerId}
                        onClick={() => {
                          const selectedSpeaker = analysisResult.speakers.find(s => s.id === selectedSpeakerId);
                          if (selectedSpeaker) {
                            onApplyNotes(selectedSpeaker.notesMarkdown);
                            onClose();
                          }
                        }}
                      >
                        <Check size={16} /> Aplicar notas de {selectedSpeakerId ? selectedSpeakerId.split(' ')[0] : '...'}
                      </button>
                    )}
                    <button
                      type="button"
                      className="btn btn-secondary"
                      style={{ marginTop: '0.5rem' }}
                      onClick={() => {
                        setStatus('idle');
                        setAudioFile(null);
                        setAnalysisResult(null);
                        setRawResponse('');
                        setEditableRawResponse('');
                        setShowRawEditor(false);
                        setSelectedSpeakerId(null);
                        setTargetBookId('');
                      }}
                    >
                      Procesar otra grabación
                    </button>
                  </div>
                </div>
              ) : null}
            </>
          ) : (
            /* History Tab */
            <div style={{ marginTop: '1rem' }}>
              <h4 className="serif-title" style={{ fontSize: '1.20rem', marginBottom: '1rem' }}>
                Historial de Transcripciones
              </h4>
              {isDemoMode && (
                <p style={{ fontSize: '0.75rem', color: '#fbbf24', marginBottom: '1rem', fontStyle: 'italic' }}>
                  * Nota: En modo de demostración, las grabaciones de audio son locales de esta sesión y no se reproducirán tras recargar la página.
                </p>
              )}

              {loadingHistory ? (
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '2rem 0' }}>
                  <Loader2 className="voice-spinner" size={24} />
                  <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginTop: '0.5rem' }}>Cargando historial...</p>
                </div>
              ) : history.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '3rem 1rem', border: '1px dashed var(--border)', borderRadius: 'var(--radius-sm)' }}>
                  <Volume2 size={36} style={{ color: 'var(--text-muted)', opacity: 0.5, marginBottom: '0.75rem' }} />
                  <p style={{ fontSize: '0.9rem', color: 'var(--text-muted)' }}>No hay transcripciones grabadas en el historial.</p>
                </div>
              ) : (
                <div className="voice-history-list">
                  {history.map((item, idx) => (
                    <div key={item.id || idx} className="voice-history-item">
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                        <div>
                          <p style={{ fontWeight: '600', fontSize: '0.9rem', margin: 0, color: 'var(--text-primary)' }}>{item.audioName}</p>
                          <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', margin: '0.2rem 0 0 0' }}>
                            {new Date(item.createdAt).toLocaleDateString('es-ES', { 
                              day: 'numeric', 
                              month: 'long', 
                              year: 'numeric',
                              hour: '2-digit',
                              minute: '2-digit'
                            })}
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={() => handleDeleteHistoryItem(item)}
                          style={{ background: 'none', border: 'none', color: '#f87171', cursor: 'pointer', padding: '0.25rem' }}
                          title="Borrar del historial"
                        >
                          <X size={14} />
                        </button>
                      </div>

                      {item.audioUrl && (
                        <div style={{ marginTop: '0.5rem' }}>
                          <audio src={item.audioUrl} controls style={{ width: '100%' }} />
                        </div>
                      )}

                      <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '0.5rem' }}>
                        <button
                          type="button"
                          className="btn btn-secondary"
                          style={{ padding: '0.35rem 0.75rem', fontSize: '0.85rem' }}
                          onClick={() => {
                            setAnalysisResult(item.result);
                            setAudioFile({ name: item.audioName });
                            setUploadedAudioUrl(item.audioUrl);
                            setStatus('success');
                            setActiveTab('new');
                            setSelectedSpeakerId(null);
                            setTargetBookId('');
                          }}
                        >
                          Cargar análisis pasados
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="voice-assistant-footer">
          <button type="button" className="btn btn-secondary" onClick={onClose}>
            Cerrar
          </button>
        </div>
      </div>
    </>
  );
}
