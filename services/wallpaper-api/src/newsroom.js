import { automationKey, automationTransaction, enqueueAutomation } from './automation-queue.js';
import { wallpaperSpeech } from './newsroom-speech.js';

const desk = image => `mascot/news/TaylorDesk${image}.png`;
const resting = () => ({ image_url: null, message: '', type: 'post', transition_message: null, lizard_image_url: desk('Closed') });
const interview = mascot => ['ki','taylor','warren'].includes(mascot) ? mascot[0].toUpperCase()+mascot.slice(1) : 'Ki';
const words = text => (text.match(/\w+/g) || []).length;

export function createNewsroom(pool, { random = Math.random, speech = wallpaperSpeech } = {}) {
  return {
    async read() {
      const state = (await pool.query('SELECT entry,generation,kind FROM node_newsroom_states WHERE id=1')).rows[0];
      let entry = state?.entry;
      let backdrop_url = entry?.image_url;
      if (!backdrop_url) {
        const past = (await pool.query(`SELECT p.*,u.username AS owner_username,s.username AS setter_username FROM past_links p
          JOIN users u ON u.id=p.user_id LEFT JOIN users s ON s.id=p.set_by_id WHERE u.deleted_at IS NULL ORDER BY p.id DESC LIMIT 1`)).rows[0];
        backdrop_url = past?.post_url || null;
        if (!entry?.lizard_image_url) entry = past ? { ...resting(), image_url:past.post_url,
          message:speech({tags:past.tags||'',setter:past.setter_username||'anon',settee:past.owner_username,random}) } : resting();
      }
      return { entry: entry || resting(), backdrop_url, generation: state?.generation || '0', kind: state?.kind || null };
    },
    run: job => automationTransaction(pool, job, async c => {
      const state = (await c.query('SELECT * FROM node_newsroom_states WHERE id=1 FOR UPDATE')).rows[0];
      const now = (await c.query('SELECT CURRENT_TIMESTAMP AS now')).rows[0].now;
      let generation = state.generation, kind = state.kind, entry, story = state.story;
      let busyUntil = state.busy_until, throttleUntil = state.throttle_until;
      const actions = [];
      const later = async (step, seconds) => enqueueAutomation(c, {
        key: automationKey('news-step', `${generation}:${step}`), kind: 'news-step',
        payload: { generation: String(generation), step }, runAt: new Date(now.getTime()+seconds*1000),
      });
      const busy = busyUntil && busyUntil > now;
      if (job.kind === 'news-wallpaper') {
        if (busy || (throttleUntil && throttleUntil > now)) return;
        const past = (await c.query(`SELECT p.*,u.username AS owner_username,s.username AS setter_username
          FROM past_links p JOIN users u ON u.id=p.user_id LEFT JOIN users s ON s.id=p.set_by_id
          WHERE p.id=$1 AND u.deleted_at IS NULL`, [job.payload.past_link_id])).rows[0];
        if (!past || !/\.(png|jpe?g|gif|bmp|webp)(?:\?|$)/i.test(past.post_url || '')) return;
        generation = String(BigInt(generation)+1n); kind = 'wallpaper'; busyUntil = null;
        throttleUntil = new Date(now.getTime()+(7+Math.floor(random()*3))*1000);
        entry = { image_url: past.post_url, message: speech({ tags: past.tags || '', setter: past.setter_username || 'anon', settee: past.owner_username, random }),
          type: 'post', transition_message: null, lizard_image_url: desk('Open') };
        story = entry;
        actions.push({ target: 'desk', entry }, { target: 'news_backdrop', entry });
        await later('wallpaper-closed', 3);
      } else if (job.kind === 'scoop-round' || job.kind === 'news-scoop') {
        if (busy) return job.kind === 'news-scoop' ? { deferUntil: busyUntil } : undefined;
        // Claiming a scoop shares the same row lock used by social editing.
        const scoop = (await c.query(`SELECT s.*,u.username,u.mascot FROM scoops s JOIN users u ON u.id=s.user_id
          WHERE u.deleted_at IS NULL AND ${job.kind === 'news-scoop' ? 's.id=$1' : 's.was_shown=false'}
          ORDER BY s.created_at,s.id LIMIT 1 FOR UPDATE OF s`, job.kind === 'news-scoop' ? [job.payload.scoop_id] : [])).rows[0];
        if (!scoop) return;
        generation = String(BigInt(generation)+1n); kind = 'scoop';
        story = { image_url: null, type: 'scoop', transition_message: null,
          message: `${scoop.details} - ${scoop.username}`, lizard_image_url: `mascot/news/${interview(scoop.mascot)}InterviewOpen.png` };
        busyUntil = new Date(now.getTime()+(4+3+words(story.message)*2+6+5+5+30)*1000);
        entry = { ...story, message: `Breaking news from ${scoop.username}!`, lizard_image_url: desk('BreakingNews') };
        actions.push({ target: 'chyron', message: `Breaking news from ${scoop.username}: "${scoop.details.trim().split(/\s+/).slice(0,6).join(' ')}..."` }, { target: 'desk', entry });
        await c.query('UPDATE scoops SET was_shown=true,updated_at=CURRENT_TIMESTAMP WHERE id=$1', [scoop.id]);
        await later('away', 4);
      } else if (job.kind === 'news-entry') {
        if (busy) return { deferUntil: busyUntil };
        generation = String(BigInt(generation)+1n); kind = 'wallpaper'; story = job.payload.entry;
        entry = { ...story, transition_message:null }; story = entry; busyUntil = null;
        if (job.payload.entry.transition_message || job.payload.phase==='away' || job.payload.phase==='to_desk' || entry.type==='scoop') {
          kind='scoop'; busyUntil=new Date(now.getTime()+(words(story.message)*2+60)*1000);
          if (job.payload.entry.transition_message) {
            entry={...story,message:job.payload.entry.transition_message,lizard_image_url:desk('BreakingNews')}; await later('away',4);
          } else if(job.payload.phase==='away') {
            entry={...resting(),message:"Let's find out more",lizard_image_url:desk('Transition')};await later('interview',3);
          } else if(job.payload.phase==='to_desk') {
            actions.push({target:'chyron',remove:true});await later('done',5);
          } else await later('to-desk',words(story.message)*2+6);
        } else if(job.payload.done) await later('resting',5);
        else await later('wallpaper-closed',3);
        actions.push({ target: 'desk', entry });
        if (entry.image_url) actions.push({ target: 'news_backdrop', entry });
      } else if (job.kind === 'news-step') {
        if (String(generation) !== job.payload.generation) return; // superseded story
        switch (job.payload.step) {
          case 'away':
            entry = { ...resting(), message: "Let's find out more", lizard_image_url: desk('Transition') };
            await later('interview', 3); break;
          case 'interview': entry = story; await later('to-desk', words(story.message)*2+6); break;
          case 'to-desk':
            entry = { ...story, type: 'post', message: 'Wow! Thanks!', lizard_image_url: story.lizard_image_url.replace('InterviewOpen','InterviewClosed') };
            actions.push({ target: 'chyron', remove: true }); await later('done', 5); break;
          case 'done':
            entry = { ...resting(), message: "... And we're back! If anything else happens I'll keep you posted!", lizard_image_url: desk('Transition') };
            await later('resting', 5); break;
          case 'resting': entry = resting(); busyUntil = null; kind = null; break;
          case 'wallpaper-closed': entry = { ...story, lizard_image_url: desk('Closed') }; kind = null; break;
          default: throw new Error('InvalidNewsStep');
        }
        actions.push({ target: 'desk', entry });
      } else throw new Error('InvalidNewsJob');
      await c.query(`UPDATE node_newsroom_states SET generation=$1,kind=$2,entry=$3,story=$4,busy_until=$5,
        throttle_until=$6,updated_at=CURRENT_TIMESTAMP WHERE id=1`, [generation,kind,JSON.stringify(entry),JSON.stringify(story),busyUntil,throttleUntil]);
      await c.query(`INSERT INTO node_automation_events (request_key,generation,effects,created_at,updated_at)
        VALUES($1,$2,$3,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP) ON CONFLICT (request_key) DO NOTHING`, [job.job_key,generation,JSON.stringify({ actions })]);
    }),
  };
}
