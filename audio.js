export class AudioController {
    constructor() {
        this.ctx = null;
        this.isPlaying = false;
        this.intensity = 0; // 0 = chill, 1 = dramatic
        
        // Music state
        this.nextNoteTime = 0;
        this.tempo = 100;
        this.noteIndex = 0;
        
        // Chill progression (Pentatonic scale-ish)
        this.chillNotes = [261.63, 293.66, 329.63, 392.00, 440.00]; 
        // Dramatic progression (Minor/Dissonant)
        this.dramaticNotes = [261.63, 277.18, 293.66, 311.13, 196.00];
    }

    init() {
        if (!this.ctx) {
            this.ctx = new (window.AudioContext || window.webkitAudioContext)();
        }
    }

    startMusic() {
        if (!this.ctx) this.init();
        if (this.ctx.state === 'suspended') this.ctx.resume();
        this.isPlaying = true;
        this.nextNoteTime = this.ctx.currentTime;
        this.scheduler();
    }

    stopMusic() {
        this.isPlaying = false;
        if (this.ctx) this.ctx.suspend();
    }

    setIntensity(level) {
        // level 0 to 1
        this.intensity = Math.max(0, Math.min(1, level));
        // Increase tempo with intensity
        this.tempo = 100 + (this.intensity * 60);
    }

    scheduler() {
        if (!this.isPlaying) return;

        while (this.nextNoteTime < this.ctx.currentTime + 0.1) {
            this.playBeat(this.nextNoteTime);
            this.scheduleNote(this.nextNoteTime);
            const secondsPerBeat = 60.0 / this.tempo;
            this.nextNoteTime += secondsPerBeat / 4; // 16th notes
            this.noteIndex++;
        }
        
        setTimeout(() => this.scheduler(), 25);
    }

    playBeat(time) {
        // Simple kick drum on beats 1 and 3 (of 4/4)
        // 16th notes: 0, 4, 8, 12 are quarter beats
        if (this.noteIndex % 8 === 0) { // Kick
            const osc = this.ctx.createOscillator();
            const gain = this.ctx.createGain();
            osc.frequency.setValueAtTime(150, time);
            osc.frequency.exponentialRampToValueAtTime(0.01, time + 0.5);
            gain.gain.setValueAtTime(1, time);
            gain.gain.exponentialRampToValueAtTime(0.01, time + 0.5);
            osc.connect(gain);
            gain.connect(this.ctx.destination);
            osc.start(time);
            osc.stop(time + 0.5);
        }

        // Hi-hats increase with intensity
        if (this.intensity > 0.3 && this.noteIndex % 2 === 0) {
            this.playNoise(time, 0.05);
        }
        
        // Dramatic bass drone if high intensity
        if (this.intensity > 0.7 && this.noteIndex % 16 === 0) {
             const osc = this.ctx.createOscillator();
             osc.type = 'sawtooth';
             const gain = this.ctx.createGain();
             osc.frequency.setValueAtTime(50, time);
             gain.gain.setValueAtTime(0.3 * this.intensity, time);
             gain.gain.linearRampToValueAtTime(0, time + 2);
             osc.connect(gain);
             gain.connect(this.ctx.destination);
             osc.start(time);
             osc.stop(time + 2);
        }
    }

    scheduleNote(time) {
        // Melody 
        // Play less frequently in chill mode, more chaotic in dramatic mode
        
        let chance = 0.3; // 30% chance to play a note on a 16th
        if (this.intensity > 0.5) chance = 0.6;

        if (Math.random() < chance) {
            const osc = this.ctx.createOscillator();
            const gain = this.ctx.createGain();
            
            // Choose note set based on intensity mix
            const useDramatic = Math.random() < this.intensity;
            const notes = useDramatic ? this.dramaticNotes : this.chillNotes;
            const note = notes[Math.floor(Math.random() * notes.length)];
            
            // Random octave
            const octave = Math.pow(2, Math.floor(Math.random() * 3)); // 1, 2, or 4
            
            osc.type = useDramatic ? 'square' : 'sine';
            osc.frequency.setValueAtTime(note * octave, time);
            
            gain.gain.setValueAtTime(0.1, time);
            gain.gain.exponentialRampToValueAtTime(0.001, time + 0.5);
            
            osc.connect(gain);
            gain.connect(this.ctx.destination);
            osc.start(time);
            osc.stop(time + 0.5);
        }
    }

    playNoise(time, duration) {
        const bufferSize = this.ctx.sampleRate * duration;
        const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
        const data = buffer.getChannelData(0);
        for (let i = 0; i < bufferSize; i++) {
            data[i] = Math.random() * 2 - 1;
        }
        const noise = this.ctx.createBufferSource();
        noise.buffer = buffer;
        const gain = this.ctx.createGain();
        gain.gain.value = 0.05;
        noise.connect(gain);
        gain.connect(this.ctx.destination);
        noise.start(time);
    }
    
    playCollectSound() {
        if (!this.ctx) return;
        const time = this.ctx.currentTime;
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(880, time);
        osc.frequency.exponentialRampToValueAtTime(1760, time + 0.1);
        gain.gain.setValueAtTime(0.3, time);
        gain.gain.linearRampToValueAtTime(0, time + 0.1);
        osc.connect(gain);
        gain.connect(this.ctx.destination);
        osc.start(time);
        osc.stop(time + 0.1);
    }

    playCrashSound() {
        if (!this.ctx) return;
        this.playNoise(this.ctx.currentTime, 0.5);
    }

    playGameOverMusic() {
        if (!this.ctx) return;
        
        // Max intensity
        this.intensity = 1.0; 
        this.tempo = 60; // Slow down for dramatic effect? Or speed up? "Extremely dramatic" might mean chaotic.
        // Let's go for a chaotic discord
        
        const time = this.ctx.currentTime;
        
        // Low drone
        const osc = this.ctx.createOscillator();
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(50, time);
        osc.frequency.linearRampToValueAtTime(30, time + 3);
        
        const gain = this.ctx.createGain();
        gain.gain.setValueAtTime(0.5, time);
        gain.gain.exponentialRampToValueAtTime(0.01, time + 4);
        
        osc.connect(gain);
        gain.connect(this.ctx.destination);
        osc.start(time);
        osc.stop(time + 4);
        
        // Discordant Cluster
        const notes = [100, 115, 140, 180, 210];
        notes.forEach((freq, i) => {
             const o = this.ctx.createOscillator();
             o.type = 'triangle';
             o.frequency.setValueAtTime(freq, time);
             o.frequency.linearRampToValueAtTime(freq * 0.5, time + 3); // Pitch drop
             
             const g = this.ctx.createGain();
             g.gain.setValueAtTime(0.2, time);
             g.gain.exponentialRampToValueAtTime(0.001, time + 3);
             
             o.connect(g);
             g.connect(this.ctx.destination);
             o.start(time);
             o.stop(time + 3);
        });
    }
}
