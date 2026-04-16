import 'react-native-gesture-handler';
import { registerRootComponent } from 'expo';
import App from './App';

/**
 * Registro do Componente Raiz: Essencial para que o Metro Bundler e o Expo Go
 * consigam inicializar o aplicativo corretamente em qualquer plataforma.
 */
registerRootComponent(App);
