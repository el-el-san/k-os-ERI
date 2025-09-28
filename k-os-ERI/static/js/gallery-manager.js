(function() {
  'use strict';

  // Check if the manager is already defined
  if (window.KamuiGalleryManager) {
    return;
  }

  /**
   * Manages interactions with a shared media gallery to prevent event listener conflicts.
   * @namespace KamuiGalleryManager
   */
  const KamuiGalleryManager = {
    owner: null,
    callback: null,

    /**
     * Initializes the gallery manager and sets up the global message listener.
     * This should be called once when the application loads.
     */
    initialize() {
      if (this.isInitialized) {
        return;
      }
      window.addEventListener('message', this.handleMessage.bind(this));
      this.isInitialized = true;
      console.log('KamuiGalleryManager initialized.');
    },

    /**
     * Sets the current owner and their callback function.
     * This is called when a component wants to open the gallery.
     * @param {string} ownerId - A unique identifier for the component opening the gallery.
     * @param {function} callback - The function to execute when a media item is selected.
     */
    setOwner(ownerId, callback) {
      this.owner = ownerId;
      this.callback = callback;
      console.log(`KamuiGalleryManager owner set to: ${ownerId}`);
    },

    /**
     * Clears the current owner and callback.
     * This should be called when the gallery is closed or the component is destroyed.
     */
    clearOwner() {
      console.log(`KamuiGalleryManager owner ${this.owner} cleared.`);
      this.owner = null;
      this.callback = null;
    },

    /**
     * Handles the 'message' event from the window.
     * It checks if the message is from the media gallery and if the current owner is the intended recipient.
     * @param {MessageEvent} event - The message event.
     */
    handleMessage(event) {
      const data = this._coerceMessageData(event.data);

      if (!data || data.type !== 'media-selected') {
        return;
      }

      if (!this.owner) {
        console.warn('KamuiGalleryManager received a message but has no owner.');
        return;
      }

      console.log(`KamuiGalleryManager received message for owner: ${this.owner}`);
      if (typeof this.callback === 'function') {
        this.callback(data);
      } else {
        console.warn(`KamuiGalleryManager: Owner ${this.owner} has no callback.`);
      }

      // The owner is responsible for clearing itself after handling the message.
    },

    /**
     * Coerces message data into a JavaScript object if it's a string.
     * @param {*} raw - The raw message data.
     * @returns {object|null} The parsed data or null if parsing fails.
     * @private
     */
    _coerceMessageData(raw) {
      if (typeof raw === 'string') {
        try {
          return JSON.parse(raw);
        } catch (error) {
          return null;
        }
      }
      return raw;
    }
  };

  // Initialize the manager as soon as the script loads.
  KamuiGalleryManager.initialize();

  // Expose the manager to the global window object.
  window.KamuiGalleryManager = KamuiGalleryManager;

})();
