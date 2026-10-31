// Contexto único da aplicação, passado a todas as telas: dispositivo, áudio, persistência e navegação.
import { Guitar } from '../device/guitar.js';
import { AudioEngine } from '../audio/engine.js';
import { Store } from './store.js';
import { toast } from './dom.js';
import { setFlats } from '../music/theory.js';
import { installPractice } from '../engine/practice.js';
import { installLearn } from '../learn/index.js';

export function createApp() {
  const store = new Store();
  setFlats(store.get('settings.flats'));
  const app = {
    store,
    guitar: new Guitar(),
    audio: new AudioEngine(),
    toast,
    views: new Map(),                 // id -> módulo de tela
    navigate: (id, params) => app.router?.go(id, params),
    practice: null,                   // preenchido por engine/ (iniciar um Score): app.practice.start(score, opts)
    get settings() { return store.get('settings'); },
  };
  app.audio.bindStore?.(store);
  installPractice(app);   // engine/practice.js  -> app.practice
  installLearn(app);      // learn/index.js      -> app.learn
  return app;
}
