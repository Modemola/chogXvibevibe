import { createContext, useContext } from 'react';

/** Which cut is rendering: the original film, or the Chog edition made for the Chogathon. */
export const Edition = createContext<'original' | 'chog'>('original');
export const useEdition = () => useContext(Edition);
