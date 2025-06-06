let currentClassId = 'defaultClass';

export const getCurrentClassId = () => currentClassId;
export const setCurrentClassId = (id: string | null) => {
  currentClassId = id ?? 'defaultClass';
};
