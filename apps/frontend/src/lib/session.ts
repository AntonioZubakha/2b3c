const SESSION_KEY = 'stonee_session_id';

export const getSessionId = () => {
  let id = localStorage.getItem(SESSION_KEY);
  if (!id) {
    id = Math.random().toString(36).substring(2, 15);
    localStorage.setItem(SESSION_KEY, id);
  }
  return id;
};

export const peekSessionId = () => localStorage.getItem(SESSION_KEY);

