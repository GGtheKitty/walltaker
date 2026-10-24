import { LinkValidationError } from './link-settings.js';

export const wizardSteps = ['intro', 'summon', 'control', 'kinks', 'gender', 'surprise', 'no_fun', 'orgasmic_conclusion'];
const choices = (value, allowed) => {
  if (value == null) return [];
  if (!Array.isArray(value) || value.some((item) => typeof item !== 'string' || (item && !allowed.includes(item)))) {
    throw new LinkValidationError({ base: ['Invalid wizard choices.'] });
  }
  return value.filter(Boolean);
};

export function applyWizard(step, input, link) {
  const index = wizardSteps.indexOf(step);
  if (index < 0 || index === wizardSteps.length - 1 || !input || typeof input !== 'object' || Array.isArray(input)) {
    throw new LinkValidationError({ base: ['Invalid wizard step.'] });
  }
  const changes = {}, user = {}, enable = [];
  let blacklist = link.blacklist || '';
  if (step === 'intro') {
    changes.min_score = input.gooner === 'true' ? 10 : 50;
    if (input.gooner === 'true') Object.assign(user, { pervert: true, mascot: 'taylor' });
  } else if (step === 'summon' && input.impatient === 'true') {
    changes.min_score = link.min_score - 10;
    enable.push('can_be_set_by_lizard');
  } else if (step === 'control') {
    const protection = Number(input.protect ?? '3');
    if (!Number.isInteger(protection) || protection < 1 || protection > 5) throw new LinkValidationError({ base: ['Invalid protection level.'] });
    if (protection > 1) blacklist += ' nightmare_fuel nazi why';
    if (protection > 2) blacklist += ' meme death body_horror gore scat';
    if (protection > 3) blacklist += ' urine fart rape messy_diaper cursed_image vore pregnant';
    if (protection > 4) blacklist += ' diapers humor joke icon blood pain sadism crossover obese what_has_science_done';
    changes.blacklist = blacklist;
    changes.min_score = link.min_score + 5 * protection;
  } else if (step === 'kinks') changes.terms = input.terms ?? '';
  else if (step === 'gender') {
    const genders = choices(input.blacklisted_genders, ['male', 'female', 'nonbinary', 'genderbends']);
    const parts = choices(input.blacklisted_parts, ['cocks', 'pussies', 'breasts', 'assholes', 'cloaca']);
    const sex = choices(input.blacklisted_sexualities, ['gay', 'straight']);
    const tags = { male: 'male_focus manly muscular', female: 'female_focus girly', nonbinary: 'genderfluid ambiguous_gender', genderbends: 'genderswap',
      cocks: 'penis', pussies: 'pussy', breasts: 'breasts teats', assholes: 'anus anal_penetration', cloaca: 'cloaca' };
    for (const key of ['male', 'female', 'nonbinary', 'genderbends']) if (genders.includes(key)) blacklist += ' ' + tags[key];
    for (const key of ['cocks', 'pussies', 'breasts', 'assholes', 'cloaca']) if (parts.includes(key)) blacklist += ' ' + tags[key];
    if (sex.includes('gay')) {
      if (genders.includes('male')) blacklist += ' male/male';
      if (genders.includes('female')) blacklist += ' female/female';
      if (!genders.includes('male') && !genders.includes('female')) blacklist += ' female/female male/male';
    }
    if (sex.includes('straight')) blacklist += ' male/female';
    changes.blacklist = blacklist;
    if (!genders.includes('male') && genders.includes('female')) user.mascot = 'warren';
    else if (genders.includes('male') && !genders.includes('female')) user.mascot = 'taylor';
    else if (genders.includes('male') && genders.includes('female')) user.mascot = 'ki';
  } else if (step === 'surprise') changes.theme = typeof input.theme === 'string' ? input.theme.trim() : input.theme ?? null;
  else if (step === 'no_fun') changes.friends_only = input.friends_only === 'true';
  return { changes, user, enable, nextStep: wizardSteps[index + 1], wizardPage: step === 'no_fun' ? null : wizardSteps[index + 1] };
}
