export const privacyKey = "privacy";

export const applyStoredPrivacy = `try{if(localStorage.getItem("${privacyKey}"))document.documentElement.setAttribute("data-privacy","")}catch(e){}`;
