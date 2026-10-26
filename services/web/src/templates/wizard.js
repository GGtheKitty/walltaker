// Native templates. Dialogue and choice labels preserve the original wizard pages.
import {html,empty,hidden,button} from './html.js';
import {card,errors} from './wallpaper.js';
export const steps = ['intro','summon','control','kinks','gender','surprise','no_fun','orgasmic_conclusion'];
export function wizard(v) {
 const blacklist=(v.link.blacklist || '').split(/\s+/).filter(Boolean), terms=(v.link.terms || '').toLowerCase(), username=v.user.username.toLowerCase(), capitalized=v.user.username[0].toUpperCase()+v.user.username.slice(1).toLowerCase();
 const warren_thinks_youre_perverted=v.user.pervert || blacklist.length<4,
 warren_thinks_youre_really_perverted=v.user.pervert && blacklist.length<4,
 warren_thinks_youre_really_really_perverted=v.user.pervert && blacklist.length<2,
 warren_thinks_youre_boring=!v.user.pervert || blacklist.length>8,
 warren_thinks_youre_really_boring=!v.user.pervert && blacklist.length>8,
 warren_thinks_youre_really_really_boring=!v.user.pervert && blacklist.length>15;
 const apply='/links/'+v.link.id+'/wizard/'+v.step+'/apply';
 const image=(name,width=70)=>html`<img src="${v.asset('images/'+name)}" alt="Link mage" class="mascot" width="${width}">`;
 const choice=(label,key,value,className='')=>html`<form method="post" action="${apply}" class="button_to">${hidden('authenticity_token',v.csrf)}${hidden(key,value)}<button class="${className}">${label}</button></form>`;
 const defaultTerms=(warren_thinks_youre_perverted?"I'm a huge fucking gooner":"Hi! Please read my blacklist carefully just in case I haven't covered everything!")+'\n'+(blacklist.length>15?'Please NO EXTREME CONTENT.\n':'')+'My biggest turn ons are:\n'+(warren_thinks_youre_perverted?'My new triggers are':"I'm learning to like:")+'\n\n'+(warren_thinks_youre_perverted?"I'll let you know if you make me CUM >:)":"Please make sure your choices fit well on my device!");
 const termsForm=()=>html`<form method="post" action="${apply}" class="full-width">${hidden('authenticity_token',v.csrf)}<textarea name="terms" aria-label="Link terms" maxlength="255">${v.choices?.terms ?? defaultTerms}</textarea><button>I'm done!</button></form>`;
 const genderForm=()=>html`<form method="post" action="${apply}" class="full-width">${hidden('authenticity_token',v.csrf)}${[
 ['blacklisted_genders',"I don't like expressions of:",[['male','Maleness'],['female','Femaleness'],['nonbinary','Non-Binary/Non-Conforming... ness?'],['genderbends','Gender Bent Characters']]],
 ['blacklisted_parts',"I don't want to see:",[['cocks','Cocks'],['pussies','Pussies'],['breasts','Boobs'],['assholes','Assholes'],['cloaca',"Cloacas (it's e621 after all)"]]],
 ['blacklisted_sexualities',"I don't like seeing partners that are:",[['gay','Similar (gay, bi, pan)'],['straight','Different (straight)']]],
 ].map(([name,label,options])=>html`<h3>${label}</h3>${hidden(name+'[]','')}${options.map(([value,text])=>html`<div class="form__row"><input type="checkbox" id="${name}_${value}" name="${name}[]" value="${value}" ${(Array.isArray(v.choices?.[name]) ? v.choices[name] : []).includes(value)?html`checked`:empty}><label for="${name}_${value}">${text}</label></div>`)}`)}<button>I'm done!</button></form>`;
 let content;
 switch(v.step) {
 case "intro": content=html`
  <p>
    OH! Hi, we were expecting you! Let me get the link-mages in here to get this on a roll! They will need a little
    input from you, but it won't take long! I promise! There's just one little thing we need to get out of the way.
  </p>
  <p>
    Could you also, like, <em>just for joke or whatever,</em> just like...
    <strong>vocalize your undying gratitude for porn and it's unrelenting desire to overtake humanity?</strong>
  </p>

  <div class="accent-block choice">
    <div class="accent-block__charm">
      <ion-icon role="presentation" name="build"></ion-icon>
      You choose!
    </div>

    ${choice('FUCK YES I FUCKING LOVE LORD PORN',"gooner",'true','')}<br/>

    ${choice('Oh... ok? Porn is... great?',"gooner",'false','')}<br/>

    ${choice('No shut up',"gooner",'false','')}
  </div>
`;break;
 case "summon": content=html`
  <div class="link-preview">
    ${card(v,v.link)}
  </div>

  <div class="intro">
    <div class="thought"><div>Lorem pussydom, dickolar sit amet, bussy pussy nbussy garry bussy, nostra ici construecteura linkus ${v.link.id}, <em>fuckus penetronis!</em></div></div>
    ${image('mascot/Wizards.png',300)}
  </div>

  <div class="accent-block choice">
    <div class="accent-block__charm">
      <ion-icon role="presentation" name="build"></ion-icon>
      You choose!
    </div>

    ${choice('Thanks cuties!',"impatient",'false','')}

    ${choice('Thanks but... can we get a move on?',"impatient",'true','')}
  </div>
`;break;
 case "control": content=html`
  <div class="guide__container">
    <div class="guide guide--blacklist">
      <div class="thought thought--large">
        No problem hun!</br>
        We should really get to work though! This fresh link is some nice work, but it's a bit boring at the moment,
        maybe even a little dangerous!
      </div>
      ${image('mascot/TaylorSFW.png',160)}
    </div>

    <div class="link-preview link-preview--static">
      ${card(v,v.link)}
    </div>
  </div>

  <blockquote>
    <div>${image('mascot/TaylorHead.png',70)}</div>
    <p>
      Without a blacklist, someone could send you really shocking posts!
    </p>
  </blockquote>

  <blockquote class="right">
    <p>
      Probably from me heheheheheheheh
    </p>
    <div>${image('mascot/WarrenHead.png',70)}</div>
  </blockquote>

  <blockquote>
    <div>${image('mascot/TaylorHead.png',70)}</div>
    <p>
      Well, yes that sometimes does happen, where someone picks a wallpaper that they think you might like, but ends up
      being something you'd rather not see. <strong>But there's also assholes out there that just like posting the worst E621
      has to offer!</strong> We need to have a strong blacklist to put these dicks in their place!
    </p>
  </blockquote>

  <blockquote class="right">
    <p>
      You can put my dick... You can put in place... My dick can be put in place by...
    </p>
    <div>${image('mascot/WarrenHead.png',70)}</div>
  </blockquote>

  <blockquote>
    <div>${image('mascot/TaylorHead.png',70)}</div>
    <p>
      ...
    </p>
  </blockquote>

  <blockquote class="right">
    <p>
      I want to fuck your cunt again.
    </p>
    <div>${image('mascot/WarrenHead.png',70)}</div>
  </blockquote>

  <blockquote>
    <div>${image('mascot/TaylorHead.png',70)}</div>
    <p>
      ... you tried at least.
    </p>
  </blockquote>

  <blockquote>
    <div>${image('mascot/TaylorHead.png',70)}</div>
    <p>
      <strong>${capitalized}, could you choose the level of control you'd like by default?</strong> Keeping in mind people like him (${image('mascot/WarrenHead.png',25)}) exist. I've highlighted the one most people choose for you, but if you're new, I suggest going 1 level up.
    </p>
  </blockquote>

  <div class="accent-block choice">
    <div class="accent-block__charm">
      <ion-icon role="presentation" name="build"></ion-icon>
      You choose!
    </div>

    ${choice('Maximum! I always use protection.',"protect",5,'secondary')}
    ${choice('Higher! The internet scares me.',"protect",4,'secondary')}
    ${choice('Normal. I know how the internet works.',"protect",3,'')}
    ${choice('Lower! I love how the internet works.',"protect",2,'secondary')}
    ${choice('None! Shrek and nazi fan art excites me!',"protect",1,'secondary')}
  </div>
`;break;
 case "kinks": content=html`


  <div class="guide__container">
    <div class="guide guide--theme">
      <div class="thought thought--large">
        Perfect! I've typed up some blacklist items to best fit your trust level! This space feels really empty
        though...
      </div>
      ${image('mascot/TaylorSFW.png',160)}
    </div>

    <div class="link-preview link-preview--static">
      ${card(v,v.link)}
    </div>
  </div>

  <blockquote>
    <div>${image('mascot/TaylorHead.png',70)}</div>
    <p>
      Your link terms is the best place to let people know what you like!
    </p>
  </blockquote>

  <blockquote class="right">
    <p>
      Give us all the wet, sloppy, throbbing, sticky details!
    </p>
    <div>${image('mascot/WarrenHead.png',70)}</div>
  </blockquote>

  <blockquote>
    <div>${image('mascot/TaylorHead.png',70)}</div>
    <p>
      Exactly! Be detailed, but keep it fun! Big walls of text are rarely read unless they are absolutely dripping in
      horny sheen.
    </p>
  </blockquote>

  <blockquote class="right">
    <p>
      Great place to pick up twinks. That's why I call my terms the certified bussy magnets.
    </p>
    <div>${image('mascot/WarrenHead.png',70)}</div>
  </blockquote>

  <blockquote>
    <div>${image('mascot/TaylorHead.png',70)}</div>
    <p>
      I'm sure you're well accredited, Dr. Bussyterms.
    </p>
  </blockquote>

  <blockquote class="right">
    <p>
      I am, thank you.
    </p>
    <div>${image('mascot/WarrenHead.png',70)}</div>
  </blockquote>

  <blockquote class="right">
    <p>
      Is that why you asked me go to the office store to laminate a picture of my ass with your named signed on it? They
      kicked me out and said I can't bring nudes to the Staples ever again. They didn't even have any lick-n-stick gold
      certification seals like you said they would!
    </p>
    <div>${image('mascot/KiHead.png',70)}</div>
  </blockquote>

  <blockquote class="right">
    <p>
      Staples isn't ready for my resea-
    </p>
    <div>${image('mascot/WarrenHead.png',70)}</div>
  </blockquote>

  <blockquote>
    <div>${image('mascot/TaylorHead.png',70)}</div>
    <p>
      Warren shut up.
    </p>
  </blockquote>

  <blockquote>
    <div>${image('mascot/TaylorHead.png',70)}</div>
    <p>
      <strong>${capitalized}, could you write up a basic terms?</strong> I've taken the liberty
      to give you a few prompts you can fill in. Feel free to expand on them, or start new! Remember, be detailed!
    </p>
  </blockquote>

  ${(warren_thinks_youre_perverted)?html`
    <blockquote class="right">
      <p>
        pssst, we're both perverts here based on how you're answering this quiz, so I spiced it up a bit!
      </p>
      <div>${image('mascot/WarrenHead.png',70)}</div>
    </blockquote>
  `:empty}

  <div class="accent-block choice">
    <div class="accent-block__charm">
      <ion-icon role="presentation" name="build"></ion-icon>
      You choose!
    </div>

    

    ${termsForm()}
  </div>
`;break;
 case "gender": content=html`
  <div class="guide__container">
    <div class="guide guide--centre">
      <div class="thought thought--large">
        My turn! We're going to sort out your sexuality... to the extent a lizard and a website can do that!
      </div>
      ${image('mascot/Ki.png',160)}
    </div>

    <div class="link-preview link-preview--static">
      ${card(v,v.link)}
    </div>
  </div>

  <blockquote>
    <div>${image('mascot/KiHead.png',70)}</div>
    <p>
      Sexual preference and gender identity are diverse subjects, and I'm sure you know many of the details already.
    </p>
  </blockquote>

  <blockquote class="right">
    <p>
      Many of our users aren't strictly male or female, or straight or gay.
    </p>
    <div>${image('mascot/TaylorHead.png',70)}</div>
  </blockquote>

  <blockquote>
    <div>${image('mascot/KiHead.png',70)}</div>
    <p>
      Right! It's really important we understand that. Some people, (possibly
      you ${capitalized}!) may feel deeply uncomfortable with depictions of genitalia or gender
      identity that they would rather not see.
    </p>
  </blockquote>

  <blockquote class="right">
    <p>
      We can't promise you that your link will always prevent content you'd rather not see from appearing, but we can
      get you set up so it works most of the time.
    </p>
    <div>${image('mascot/TaylorHead.png',70)}</div>
  </blockquote>

  <blockquote>
    <div>${image('mascot/KiHead.png',70)}</div>
    <p>
      ${capitalized}, can you select which of the following gender expressions and genitalia
      you'd <strong>NOT</strong> like to see as your wallpaper? <strong>If you don't select something, you will see it. It's OK to select nothing at all as well!</strong>
    </p>
  </blockquote>

  <div class="accent-block choice">
    <div class="accent-block__charm">
      <ion-icon role="presentation" name="build"></ion-icon>
      You choose!
    </div>


    ${genderForm()}
  </div>
`;break;
 case "surprise": content=html`







  <div class="guide__container">
    <div class="guide guide--centre">
      <div class="thought thought--large">
        We're almost done! You'll like this though, how much do you like surprises?
      </div>
      ${image('mascot/WarrenSFW.png',160)}
    </div>

    <div class="link-preview link-preview--static">
      ${card(v,v.link)}
    </div>
  </div>

  <blockquote>
    <div>${image('mascot/WarrenHead.png',70)}</div>
    <p>
      Sometimes, you want people to surprise you with what they think you'll get off too. Other times, you might want to
      restrict the options to a specific theme.
    </p>
  </blockquote>

  <blockquote class="right">
    <p>
      It's a good question to ask yourself! You might use different links for different moods. Maybe one for "surprises", and
      another one for a specific... kink... or... somethi-... Warren. <strong>Focus.</strong>
    </p>
    <div>${image('mascot/TaylorHead.png',70)}</div>
  </blockquote>

  <blockquote>
    <div>${image('mascot/WarrenHeadHorny.png',70)}</div>
    <p>
      Yeah... &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;I&nbsp;am.
    </p>
    <div>${image('mascot/TaylorTits.png',70)}</div>
  </blockquote>

  <blockquote class="right">
    <p>
      While he finishes up and probably cums in my face without asking for the 7th time today, I can tell you we're
      talking about the <strong>theme tag</strong>! This limits surprises, but it's fun when you're just really
      feeling... into something!
    </p>
    <div>${image('mascot/TaylorHead.png',70)}</div>
  </blockquote>

  <blockquote>
    <div>${image('mascot/WarrenHeadHorny.png',70)}</div>
    <p>
      Like slutty lizard boobs.
    </p>
  </blockquote>

  <blockquote class="right">
    <p>
      They're that good, ${capitalized}!~ I'd let you grope a bit, but you know... computers?
      <strong>Are you interested in a theme tag? Warren left some suggestions for you.</strong>
    </p>
    <div>${image('mascot/TaylorHead.png',70)}</div>
  </blockquote>

  <div class="accent-block choice">
    <div class="accent-block__charm">
      <ion-icon role="presentation" name="build"></ion-icon>
      You choose!
    </div>

    <div class="button-grid">
      ${(!(blacklist.includes('pussy')))?html`
        ${choice('Cunt!',"theme",'pussy','secondary')}
        ${choice('Dominant Females!',"theme",'dominant_female','secondary')}
        ${choice('Presenting Pussy!',"theme",'presenting_pussy','secondary')}

        ${(warren_thinks_youre_boring)?html`
          ${choice('Panties!',"theme",'panties','secondary')}
          ${choice('Camel Toe!',"theme",'cameltoe','secondary')}
        `:empty}

        ${(warren_thinks_youre_perverted)?html`
          ${choice('Horse Pussy!',"theme",'horse_pussy','secondary')}
          ${choice('Canine Cookie!',"theme",'canine_pussy','secondary')}
        `:empty}
      `:empty}

      ${(!(blacklist.includes('female_focus')))?html`
        ${choice('Girls Jacking Off!',"theme",'sex_toy_in_pussy','secondary')}
      `:empty}

      ${(!(blacklist.includes('penis')))?html`
        ${choice('Cocks!',"theme",'penis','secondary')}
        ${choice('Balls!',"theme",'balls','secondary')}
        ${choice('Horse Cock!',"theme",'horsecock','secondary')}
        ${choice('Knotted Cock!',"theme",'knot','secondary')}
        ${choice('Barbed Cock!',"theme",'penile_spines','secondary')}
        ${choice('Dominant Males!',"theme",'dominant_male','secondary')}

        ${(!(blacklist.includes('girly')))?html`
          ${choice('Femboys!',"theme",'girly','secondary')}
        `:empty}

        ${(warren_thinks_youre_boring)?html`
          ${choice('Blowjobs!',"theme",'fellatio','secondary')}
          ${choice('Frotting!',"theme",'frottage','secondary')}
          ${choice('Jockstraps!',"theme",'jockstrap','secondary')}
        `:empty}

        ${(warren_thinks_youre_perverted)?html`
          ${(!(blacklist.includes('breasts')))?html`
            ${choice('Udder Balls!',"theme",'udder_balls','secondary')}
          `:empty}
          ${choice('Guys Jacking Off!',"theme",'penile_masturbation','secondary')}
        `:empty}

        ${(warren_thinks_youre_really_perverted)?html`
          ${choice('Cock and Ball Torture!',"theme",'cock_and_ball_torture','secondary')}
          ${choice('Sperm!',"theme",'sperm_cell','secondary')}
          ${choice('Farm Fresh Milked Jizz!',"theme",'penis_milking_machine ','secondary')}
        `:empty}
      `:empty}

      ${(!(blacklist.includes('breasts')))?html`
        ${choice('Tits!',"theme",'breasts','secondary')}

        ${(warren_thinks_youre_perverted)?html`
          ${choice('HUGE Tits!',"theme",'hyper_breasts','secondary')}
          ${choice('Udders!',"theme",'udders','secondary')}
        `:empty}

        ${(warren_thinks_youre_really_perverted)?html`
          ${choice('Lactation!',"theme",'lactating','secondary')}
          ${choice('Milking!',"theme",'breast_milking','secondary')}

          ${(!(blacklist.includes('male_focus')))?html`
            ${choice('Guys Leaking Milk Out Their Pecks!',"theme",'male_lactation','secondary')}
          `:empty}
        `:empty}
      `:empty}

      ${(!(blacklist.includes('anus')))?html`
        ${choice('Assholes!',"theme",'anus','secondary')}
        ${choice('Butts!',"theme",'butt','secondary')}

        ${(warren_thinks_youre_really_really_perverted)?html`
          ${choice('Shit!',"theme",'scat','secondary')}
        `:empty}
      `:empty}

      ${(!(blacklist.includes('cloaca')))?html`
        ${choice('Bird Hole!',"theme",'cloaca','secondary')}
      `:empty}

      ${choice('Facesitting!',"theme",'facesitting','secondary')}
      ${choice('Leather!',"theme",'leather','secondary')}
      ${choice('Flashing!',"theme",'flashing','secondary')}
      ${choice('Feet!',"theme",'feet','secondary')}

      ${(warren_thinks_youre_perverted)?html`
        ${choice('Paws!',"theme",'paws','secondary')}
        ${choice('Hyper!',"theme",'hyper','secondary')}
        ${choice('Cum by the Gallon!',"theme",'excessive_cum','secondary')}
        ${choice('Baby Making!',"theme",'impregnation','secondary')}
        ${choice('Latex!',"theme",'latex','secondary')}
        ${choice('Slime!',"theme",'slime','secondary')}
      `:empty}

      ${(warren_thinks_youre_really_perverted)?html`
        ${choice('Diapers!',"theme",'diapers','secondary')}
        ${choice('Piss!',"theme",'urine','secondary')}
        ${choice('Vore!',"theme",'vore','secondary')}
        ${choice('Feral!',"theme",'feral','secondary')}
      `:empty}

      ${(warren_thinks_youre_really_really_perverted)?html`
        ${choice('Non Consensual!',"theme",'rape','secondary')}
        ${choice('Gore!',"theme",'gore','secondary')}
      `:empty}

      ${(warren_thinks_youre_boring)?html`
        ${choice('Pinups!',"theme",'pinup','secondary')}
        ${choice('Tickling!',"theme",'tickling','secondary')}
      `:empty}

      ${(warren_thinks_youre_really_boring)?html`
        ${choice('Romantic!',"theme",'romantic','secondary')}
        
      `:empty}

      ${(warren_thinks_youre_really_really_boring)?html`
        
      `:empty}

      ${(terms.includes('goon'))?html`
        ${choice('Gooning!',"theme",'gooning','secondary')}
        ${choice('Group Masturbation!',"theme",'group_masturbation','secondary')}
        ${choice('Hypno Eyes!',"theme",'hypnotic_eyes','secondary')}
      `:empty}

      ${(terms.includes('fox') || username.includes('fox'))?html`
        ${choice('Foxes!',"theme",'fox','secondary')}
      `:empty}

      ${(terms.includes('dog') || username.includes('dog') || terms.includes('pup') || username.includes('pup'))?html`
        ${choice('Dogs!',"theme",'canine','secondary')}
      `:empty}

      ${(terms.includes('cat') || username.includes('cat') || terms.includes('kitty') || username.includes('kitty'))?html`
        ${choice('Cats!',"theme",'feline','secondary')}
      `:empty}

      ${(terms.includes('horse') || username.includes('horse') || terms.includes('stud') || username.includes('stud'))?html`
        ${choice('Horses!',"theme",'equine','secondary')}
      `:empty}

      ${(terms.includes('wolf') || username.includes('wolf'))?html`
        ${choice('Wolves!',"theme",'wolf','secondary')}
      `:empty}

      ${(terms.includes('slut') || username.includes('slut'))?html`
        ${choice('Public Use!',"theme",'public_use','secondary')}
      `:empty}

      ${choice('Loimu!',"theme",'loimu_(character)','secondary')}
    </div>

    ${choice("I prefer to be surprised or will decide later.","theme","")}
  </div>
`;break;
 case "no_fun": content=html`
  <div class="guide__container">
    <div class="guide guide--centre">
      <div class="thought thought--large">
        You're pretty much done! There's just one more step!
      </div>
      ${(v.user.pervert)?html`
        ${image('mascot/TaylorNSFW.png',160)}
      `:html`
        ${image('mascot/TaylorSFW.png',160)}
      `}
    </div>

    <div class="link-preview link-preview--static">
      ${card(v,v.link)}
    </div>
  </div>

  <blockquote>
    <div>${image('mascot/TaylorHead.png',70)}</div>
    <p>
      Walltaker is all about controlled transfer of control. (and horny surprises.) But sometimes you might not want to give up all control to just... anyone (${image('mascot/WarrenHead.png',25)}) on the internet.
    </p>
  </blockquote>

  <blockquote class="right">
    <p>
      Babe, you're all over the internet.
    </p>
    <div>${image('mascot/WarrenHead.png',70)}</div>
  </blockquote>

  <blockquote class="right">
    <div>${image('mascot/TaylorTitsSFW.png',70)}</div>
    <p>
      <em>*shlick shlick shlick shlick shlick shlick shlick shlick*</em>
    </p>
    <div>${image('mascot/WarrenJacking.png',70)}</div>
  </blockquote>

  <blockquote>
    <div>${image('mascot/TaylorHead.png',70)}</div>
    <p>
      Warren, I literally just let you cum in my panties. The begging was getting intense.
    </p>
  </blockquote>

  <blockquote class="right">
    <p>
      ... hey NO! That's not ho-
    </p>
    <div>${image('mascot/WarrenHead.png',70)}</div>
  </blockquote>

  <blockquote>
    <div>${image('mascot/TaylorHead.png',70)}</div>
    <p>
      ${capitalized} you can opt to not make your link public. This will mean that people <strong>MUST</strong> make an account (or already have one) and send you a friend request that you then accept in order to be able to set a wallpaper. <strong>This slows down wallpaper changes significantly, but it's the only way we can promise you won't get shock content.</strong> (as long as you're careful about who you accept!) Would you like to turn it on?
    </p>
  </blockquote>

  <blockquote class="right">
    <p>
      You can always turn it off later!
    </p>
    <div>${image('mascot/WarrenHead.png',70)}</div>
  </blockquote>

  <div class="accent-block choice">
    <div class="accent-block__charm">
      <ion-icon role="presentation" name="build"></ion-icon>
      You choose!
    </div>

    ${choice('Limit to just friends, please!',"friends_only",'true','secondary')}
    ${choice('Anons on the internet for me, please!',"friends_only",'false','')}
  </div>
`;break;
 case "orgasmic_conclusion": content=html`
  <div class="link-preview link-preview--done">
    ${card(v,v.link)}
  </div>

  <blockquote>
    <div>${image('mascot/KiHead.png',70)}</div>
    <p>
      Great job ${capitalized}!
    </p>
  </blockquote>

  <blockquote class="right">
    <p>
      Yeah that's a great looking link!!
    </p>
    <div>${image('mascot/TaylorHead.png',70)}</div>
  </blockquote>

  <blockquote>
    <div>${image('mascot/WarrenHead.png',70)}</div>
    <p>
      We really think you're going to like the site!
    </p>
  </blockquote>

  <blockquote class="right">
    <span>
      Remember that you can change all of this later in link settings under the <div class="mock-link"><ion-icon role="presentation" name="build"></ion-icon> Edit</div> button located on the <div class="mock-link">links</div> page! We're just running this little wizard side business to help you get started! Make as many manual edits as you need later.
    </span>
    <div>${image('mascot/TaylorHead.png',70)}</div>
  </blockquote>

  <blockquote>
    <div>${image('mascot/KiHead.png',70)}</div>
    <p>
      There's some stuff in there we didn't tell you about actually, you should check it out!
    </p>
  </blockquote>

  <div class="accent-block choice">
    <div class="accent-block__charm">
      <ion-icon role="presentation" name="build"></ion-icon>
      You choose!
    </div>

    ${button("Settings please!","/links/"+v.link.id+"/edit",v.csrf,{method:"get",className:"secondary"})}
    ${button("Let me use my link!","/links/"+v.link.id,v.csrf,{method:"get"})}
  </div>
`;break;
 default: throw new Error('Unknown wizard step');
 }
 return html`<div data-turbo-prefetch="false" class="task-tools"><div class="left"><a href="/links/${v.link.id}">Come back later</a></div></div><h2 class="one-line"><span><ion-icon name="color-wand" class="big"></ion-icon>Wizard</span><meter min="0" max="100" value="${(steps.indexOf(v.step)+1)/steps.length*100}"></meter></h2>${errors(v)}${content}`;
}
