// Calibração = SÓ O TIMING (atraso entre o clique e o que chega da guitarra). Notas e casas não são ajustadas aqui.
import { openSync } from './sync.js';

export const isCalibrated = (store) => !!store.get('settings.calibratedAt');
export const openCalibration = (app) => openSync(app);
