import {html,empty,safeUrl} from './html.js';

const clients=v=>html`<table class="wallpaper-clients"><thead><tr><th>Client</th><th>Platform</th></tr></thead><tbody>${(v.clients || []).map(c=>html`<tr><td><a href="${safeUrl(c.url)}" target="_blank" rel="noopener" class="${c.deprecated?'subdued':''}">${c.name}</a><strong>${c.deprecated?'(Deprecated)':''}</strong></td><td>${c.platform}</td></tr>`)}</tbody></table>`;
export const helpHeads={
client_guide:html`
  <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0/styles/monokai.min.css" integrity="sha384-88Jvj9Q2LiBDwL7w3yciRTcH5q2zzvMFYIm4xX9/evqxJsxA33Xk9XYKcvUlPITo" crossorigin="anonymous">
  <script src="https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0/highlight.min.js" integrity="sha384-F/bZzf7p3Joyp5psL90p/p89AZJsndkSoGwRpXcZhleCWhd8SnRuoYo4d0yirjJp" crossorigin="anonymous"></script>
  <script src="https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0/languages/cpp.min.js" integrity="sha384-pF0kkJHJ7iLK/GTjymCseh94/WcMBVV6C9lKk2HdA+dut+ACEizCpQbrzWE4fpfv" crossorigin="anonymous"></script>
  <script src="https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0/languages/python.min.js" integrity="sha384-FWJTgPmIGm1+zpNhubuHRC/ulS1UK7hAZ7qiUUmKD8yGfPcn5ZXYBd2qRgi6L8Tu" crossorigin="anonymous"></script>
  <script src="https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0/languages/javascript.min.js" integrity="sha384-44q2s9jxk8W5N9gAB0yn7UYLi9E2oVw8eHyaTZLkDS3WuZM/AttkAiVj6JoZuGS4" crossorigin="anonymous"></script>
  <script src="https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0/languages/http.min.js" integrity="sha384-wt2eEhJoUmjz8wmTq0k9WvI19Pumi9/h7B87i0wc7QMYwnCJ0dcuyfcYo/ui1M6t" crossorigin="anonymous"></script>
`,
deprecated_client_guide:html`
  <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0/styles/monokai.min.css" integrity="sha384-88Jvj9Q2LiBDwL7w3yciRTcH5q2zzvMFYIm4xX9/evqxJsxA33Xk9XYKcvUlPITo" crossorigin="anonymous">
  <script src="https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0/highlight.min.js" integrity="sha384-F/bZzf7p3Joyp5psL90p/p89AZJsndkSoGwRpXcZhleCWhd8SnRuoYo4d0yirjJp" crossorigin="anonymous"></script>
  <script src="https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0/languages/http.min.js" integrity="sha384-wt2eEhJoUmjz8wmTq0k9WvI19Pumi9/h7B87i0wc7QMYwnCJ0dcuyfcYo/ui1M6t" crossorigin="anonymous"></script>
`,
};
export function index(v){return html`<h2>
  <ion-icon role="presentation" name="information-circle" class="big"></ion-icon>
  Help!
</h2>

<img src="${v.asset('images/mascot/Wizards.png')}" alt="A suave little lizard welcoming you to the website." class="mascot float-right" width="300">

<section id="getting-started">
  <h3><small>Q:</small> How do I set this up?</h3>
  <p>
    <small>A:</small>
    Thanks for being willing to give Walltaker a try! It's pretty easy to get started, but it might seem a bit weird at
    first since there are some hoops we have to jump through to be able to update your wallpaper.
  </p>

  <h4 id="getting-started-log-in">0. Log in</h4>
  <div>
    <p>
      Firstly, <strong>you will need an account.</strong> You can make an account by pressing the
      <span class="mock-link">Sign Up</span> link on the top-right-hand side of the screen. Once you have created
      an account (which should only take a minute) return to this page. You must be logged in to continue.
    </p>
  </div>

  <h4 id="getting-started-make-a-link">1. Your First Link</h4>
  <div>
    <p>
      Now that you have an account, you should make a
      <strong>
        <ion-icon role="presentation" name="document"></ion-icon>
        Link.
      </strong>
      The core "thing" in Walltaker is links. They are the sharable page that you can post on social media
      or give to friends that lets them change your wallpaper. In order to create your own link:
    </p>
    <ul class="task-list">
      <li>
        Click
        <div class="mock-link">Links</div>
        in the header.
        <img src="${v.asset('images/help/header-links-location.png')}">
      </li>
      <li>
        ...then click
        <div class="mock-button">New Link</div>
        <img src="${v.asset('images/help/new-link-button-location.png')}">
      </li>
      <li>
        ...then configure your new link.

        <p>
          <strong>There are 8 options</strong> to change here that affect who can set your wallpaper, and what
          restrictions they have to work within. Set these as you see fit, using the key below to explain what each
          option does.
        </p>
        <img src="${v.asset('images/help/new-link-form.png')}" class="small">
        <div class="accordion" data-controller="accordion">
          <button class="accordion__trigger" data-action="click->accordion#toggle" aria-controls="options-explanation">
            <ion-icon role="presentation" name="expand"></ion-icon>
            Toggle options explanation
          </button>
          <div class="accordion__content" data-accordion-target="content" id="options-explanation" aria-label="Explanation of options shown in Link Form">
            <h5>#1 Terms</h5>
            <p>
              Your link terms are simply an area to express what you'd like to see as wallpapers more generally. Nothing
              here is enforced, it's just a text field for you to leave a note that appears on the link. I suggest you
              outline what things turn you on here.
            </p>
            <h5>#2 Custom URL</h5>
            <p>
              Once you have achieved the silver trophy (by having set 300 wallpapers to other users), then you will be
              able to set a custom URL.
              This means that in addition to your regular walltaker link URL
              (<code>${v.baseUrl+'/links/1'}</code>), you can provide your own
              text for a custom url. It will also be accessible as <strong>${v.baseUrl+'/links/'}
              <mark>your-text-here</mark>
            </strong>
            </p>
            <h5>#3 Never Expires</h5>
            <p>
              Ensures that the link will never expire, and people you allow to set the link will be able to do so until
              you delete it.
            </p>
            <blockquote>
              <strong>
                <ion-icon role="presentation" name="checkbox-outline"></ion-icon>
                When checked,</strong> this link will never expire, and the #4 Expires option will be ignored.<br/>
              <strong>
                <ion-icon role="presentation" name="square-outline"></ion-icon>
                When unchecked,</strong> this link will expire at the date indicated by the #4 Expires option.
            </blockquote>
            ⚠️ With an expired link, Pornbot and the Pornlizards will still be able to set your wallpaper and you will
            still be able to connect a client.
            <h5>#5 Friends Only</h5>
            <p>
              This restricts who can set wallpapers on this link.
            </p>
            <blockquote>
              <strong>
                <ion-icon role="presentation" name="checkbox-outline"></ion-icon>
                When checked,</strong> ONLY people you have accepted friend requests with will be able to see and set
              your wallpaper.<br/>
              <strong>
                <ion-icon role="presentation" name="square-outline"></ion-icon>
                When unchecked,</strong> ANYONE (including anon users) will be able to see and set your wallpaper.
            </blockquote>
            <h5>#6 Blacklist</h5>
            <p>
              A list of E621 tags that must NOT appear on wallpapers people submit.
              <strong>Tags are separated by spaces or commas.</strong>
            </p>
            <blockquote>
              <strong>female feral feline</strong> will prevent any posts with females presenting characters, feral
              characters, or felines.<br/>
              <strong>male/male group_sex solo</strong> will mean you only get extremely boring, straight, 1-on-1 porn.
              You weirdo.
            </blockquote>
            <h5>#7 Theme Tag</h5>
            <p>
              Theme tags are special! This is a way to enforce all wallpapers submitted to this link to be tagged with a
              single, specific tag of your choosing. Use this when you're looking for something specific, like a
              specific
              species or sex act. You're horny, you'll come up with something fun.
              <strong>Be careful about how you type your tag in here.</strong> If you misspell this theme tag, no one
              will be
              able to submit anything until you remove it or correct the spelling. Confirm spelling on E621 if you have
              to. Filter tags cannot be used.
            </p>
            <blockquote>
              <strong>
                <ion-icon role="presentation" name="checkmark-outline"></ion-icon>
                loimu_(character)</strong> all posts will feature Loimu 🦌. Any other characters are blocked.<br/>
              <strong>
                <ion-icon role="presentation" name="hand-left-outline"></ion-icon>
                pokémon</strong> a misspelled tag! No one will be able to submit anything.<br/>
              <strong>
                <ion-icon role="presentation" name="hand-left-outline"></ion-icon>
                tits</strong> an alias tag! While this works in e621 search, the real tag is "breasts", so this is the
              same as misspelling a tag.<br/>
              <strong>
                <ion-icon role="presentation" name="hand-left-outline"></ion-icon>
                rating:e</strong> a filter tag! While this works in e621 search, filter tags are unsupported when
              setting a theme.
            </blockquote>
          </div>
        </div>
      </li>
    </ul>

    <div class="then">Then...</div>

    <p>
      When you've set it up how you'd like, click the
      <span class="mock-button">Create Link</span>
      button.
    </p>
  </div>

  <h4 id="getting-started-configure-client">2. Configure Your Client</h4>
  <div>
    <p>
      Congratulations! You should have a fresh link ready to share with the world. However, it currently doesn't change
      the wallpaper on anything. This is because, as simply a website, Walltaker cannot change your wallpaper for you.
      To allow us to do this,
      <strong>we need a Walltaker Client, which is an app you can install on which ever devices you'd
        like to get wallpaper updates on.</strong> It will silently check your link every few seconds, and update your
      wallpaper if there's someone has updated your wallpaper, automatically.
    </p>
    <p>
      You can download a client for which ever device you'd like to use. Follow the instructions for each one for how to
      install it, then return to this tutorial.
    </p>
    ${clients(v)}
    Please try using clients that are not deprecated.

    <div class="then">Then...</div>

    <p>
      Once you've installed your client, you need to configure it to pull wallpapers from specifically YOUR link. You
      can do this by going to your link page, and getting the link ID.
    </p>

    <ul class="task-list">
      <li>
        Click
        <div class="mock-link">Links</div>
        in the header.
        <img src="${v.asset('images/help/header-links-location.png')}">
      </li>
      <li>
        ...then click the link you made from the list
        <img src="${v.asset('images/help/own-link-location.png')}">
      </li>
      <li>
        ...then note the number that appears in this box. This is your link's ID. It's used as the identifier of which
        link you want to pull wallpapers from. In this case my ID is <strong>1</strong>. Your link ID is not private.
        <img src="${v.asset('images/help/own-link-id-location.png')}">

        <div class="accordion" data-controller="accordion">
          <button class="accordion__trigger" data-action="click->accordion#toggle" aria-controls="toml-explanation">
            <ion-icon role="presentation" name="expand"></ion-icon>
            But my client wants a .toml file?
          </button>
          <div class="accordion__content" data-accordion-target="content" id="toml-explanation" aria-label="Explanation of TOML files">
            <h5>.toml files</h5>
            <p>
              Some clients have fancier settings that you can change. They normally store these settings in a text
              configuration file called <code>walltaker.toml</code>. If you're using a client that prefers you use a
              .toml file, click the
              <strong>
                <ion-icon role="presentation" name="document-outline"></ion-icon>
                walltaker.toml
              </strong>
              link inside of this box to download a pre-made one for your link.
              <img src="${v.asset('images/help/own-link-toml-download-location.png')}">
            </p>
          </div>
        </div>
      </li>
    </ul>

    <div class="then">Then...</div>
    <p>
      Follow the instructions for your client to add this link to it. Normally it's in a menu where you can simply type
      in the link ID.
    </p>
  </div>

  <h4 id="getting-started-share-link">3. Share Your Link!</h4>
  <div>
    <p>
      Wow! You have everything set up now! Let's just verify that everything is working, and then you can share your
      link publicly!
    </p>
    <ul class="task-list">
      <li>
        Click
        <div class="mock-link">Links</div>
        in the header.
        <img src="${v.asset('images/help/header-links-location.png')}">
      </li>
      <li>
        ...then look at the link you made in the list. It should say
        <div class="mock-online">Online
          <div class="text-charm text-charm__online"></div>
        </div>
        <img src="${v.asset('images/help/own-link-online.png')}">

        <div class="accordion" data-controller="accordion">
          <button class="accordion__trigger" data-action="click->accordion#toggle" aria-controls="offline-explanation">
            <ion-icon role="presentation" name="expand"></ion-icon>
            My link doesn't say online!
          </button>
          <div class="accordion__content" data-accordion-target="content" id="offline-explanation" aria-label="Explanation of offline or new links">
            <h5>It says New</h5>
            <p>
              Your client NEVER successfully pinged the link.
            <ul>
              <li>Are you sure your set the right link ID?
                <a href="#getting-started-configure-client">Refer to step #2.</a></li>
              <li>Did your client crash?</li>
            </ul>
            </p>

            <h5>It says Offline</h5>
            <p>
              Your client pinged this link at least once, but gave up! This could be due to a number of things:
            <ul>
              <li>Did your client crash?</li>
              <li>Some phone operating systems kill background apps, this can sometimes affect clients. Refer to client
                documentation.
              </li>
              <li>Did you change the frequency of checks? It must be under 1 minute to appear
                <div class="mock-online">Online
                  <div class="text-charm text-charm__online"></div>
                </div>
                .
              </li>
            </ul>
            </p>
          </div>
        </div>
      </li>
    </ul>

    <div class="then">Then...</div>

    <p>
      Now it's time to share your link! This couldn't be easier. Just copy and paste the URL from your browser. it
      should look like <code>${v.baseUrl+'/links/420'}</code> where the last number is your link ID.
      <strong>
        Share this with anyone you want! This is where people edit your wallpaper.
      </strong>
      <img src="${v.asset('images/help/own-link-copy-url.png')}">
    </p>
  </div>
</section>

<section id="FAQs">
  <h4 id="Bad Wallpaper">FAQs</h4>
  <div class="accordion" data-controller="accordion">
    <section id="uifix">
      <br>
      To view some recently asked questions, check out  <a href="/help/faq">FAQs</a>
    </section>
    <br>
  </div>
</section>
`;}
export function faq(v){return html`<h2>
  <ion-icon role="presentation" name="information-circle" class="big"></ion-icon>
  FAQs
</h2>

<section id="bad-wallpapers">
  <h4 id="Bad Wallpaper">I got a wallpaper I don't like.</h4>
  <div class="accordion" data-controller="accordion">
    <section id="uifix">
      <br>
      Walltaker is an app for letting others change your wallpaper, <strong>without</strong> your
      approval. While I provide as many tools as possible to ensure you only get wallpapers you like, know that the
      point
      of this app is to be <strong>out of control</strong> to some extent. Here are some tips to use Walltaker's
      filtering
      features to their fullest:
      </p>
      <ul>
        <li><strong>Add people you trust as friends,</strong> this allows you to use
          <ion-icon role="presentation" name="document-lock"></ion-icon>
          friends-only links, which stops anon spam. This is by far the most effective route.
        </li>
        <li><strong>Use a theme tag.</strong> A theme tag allows you to force a tag to be present on wallpapers people
          pick
          for you. This can normally be good at filtering out things like genitalia (penis) you don't want to see or
          forcing a
          specific sexuality. (male/female)
        </li>
        <li><strong>Fill out your blacklist honestly.</strong> If you don't like <em>most</em> foot-fetish art, then it
          should be in your blacklist, even if there's some art you do like. People don't read your link terms enough to
          understand nuance.
        </li>
        <li>
          <strong>Be clear in your terms.</strong> A lot of bad wallpapers are simply mistakes. Use as few words as
          possible to express what you want.
        </li>
      </ul>
      <p>
        As always, if you think you're being harassed, contact an admin on the Discord (See link in the header) who can
        look into it for you, and will IP ban an anon user if they're trying to be malicious.
      </p>
    </section>
  </div>
</section>

<section id="client-creation">
  <h4 id="client-creation">Can I make my own client?</h4>
  <div class="accordion" data-controller="accordion">
    <section id="uifix">
      <p>
        Yes! I have some API documentation on our
        <a href="https://github.com/pupgray/walltaker" target="_blank">GitHub.</a> You can contact
        an admin on discord to get it listed on the site.
        <br>
        Here are some tips for what makes a good client:
      </p>
      <ul>
        <li>
          <strong>It doesn't just have to be wallpapers!</strong> iOS has no native APIs for setting lock screen or home
          screen wallpapers. Maybe a good idea would be a home screen widget that could show the current wallpaper
          instead?
        </li>
        <li>
          <strong>Use native APIs to set the wallpaper if available.</strong> A good example of why this is a good idea
          is
          the MacOS client. It uses the Cocoa APIs to affect the wallpaper instead of using the more-universal
          AppleScript
          solution common in apps not made with swift/obj-c. This is a <b>FAR</b> less buggy way to assign wallpapers,
          and doesn't
          require as many permissions. Research if there's an SDK/language you should use to better take advantage of
          native APIs.
        </li>
        <li>
          <strong>Just because we're short-polling, doesn't mean you can ping us as fast as you want!</strong> Please
          keep
          requests at around 1 request per 10 seconds. This service is hosted at my expensive, and heavy load will mean
          I have
          to vertically scale up the server it lives on. Don't be an asshole.
        </li>
      </ul>
    </section>
  </div>
</section>

<section id="useremailchange">
  <h4 id="useremailchange">How do I change my username / email?</h4>
  <div class="accordion" data-controller="accordion">
    <section id="uifix">
      <br>
      Please message a staff member on our Discord to change your username/email.
      <br>
      ⚠️<strong>Do NOT post your email address in any public channel</strong>
      <br>
      <li>Username change: Provide your full email address
      <li>Email change: Provide both your old and new email addresses
    </section>
    <br>
  </div>
</section>

<section id="discordkick">
  <h4 id="discordkick">Why do I keep getting kicked from the Discord server?</h4>
  <div class="accordion" data-controller="accordion">
    <section id="uifix">
      <br>
      Ensure that your account is at least 1 week old and has a profile picture before attempting to join the server.
    </section>
    <br>
  </div>
</section>

<section id="brokenprofile">
  <h4 id="brokenprofile">My profile is unviewable and I cannot undo the changes</h4>
  <div class="accordion" data-controller="accordion">
    <section id="uifix">
      <br>
      Please contact a member of staff so they can disable your custom CSS 
    </section>
    <br>
  </div>
</section>

<section id="brokenclient">
  <h4 id="brokenclient">Help! The client I am using doesn't work</h4>
  <div class="accordion" data-controller="accordion">
    <section id="uifix">
      <br>
      Check if there are any known issues with the client you are using. If you require further support, please join the
      Discord server and use the appropriate forum to report bugs with the client.
      Forums can be found at the bottom of the channel list.
    </section>
    <br>
  </div>
</section>

<section id="accountmerge">
  <h4 id="accountmerge">I would like to merge two accounts.</h4>
  <div class="accordion" data-controller="accordion">
    <section id="uifix">
      <br>
      Message Gray on our Discord and provide them with both email addresses and let them know which account you want to
      keep using.
    </section>
    <br>
  </div>
</section>

<section id="feedback">
  <h4 id="Bad Wallpaper">I have feedback/suggestion</h4>
  <div class="accordion" data-controller="accordion">
    <section id="uifix">
      <br>
      Join our Discord and post your feedback/suggestion in the #walltaker-site forum.
    </section>
    <br>
  </div>
</section>

<section id="siteissues">
  <h4 id="siteissues">I want to report a bug with the website</h4>
  <div class="accordion" data-controller="accordion">
    <section id="uifix">
      <br>
      You can either join our Discord, or post your issue to our <a href="https://github.com/pupgray/walltaker/issues" target="_blank">GitHub.</a> 
    </section>
    <br>
  </div>
</section>`;}
export function client_guide(v){const linkExample={success:true,id:1,expires:'2026-12-31T00:00:00.000Z',username:'gray',terms:"I'm trying out something new, break this please! :)",blacklist:'feet blood',post_url:'https://static1.e621.net/data/5d/87/5d87428c4839b0dc7d585b87a25af61a.png',post_url_backup:v.baseUrl+'/e621-media?token=SIGNED_TOKEN',post_thumbnail_url:'https://static1.e621.net/data/preview/5d/87/5d87428c4839b0dc7d585b87a25af61a.jpg',post_description:'',created_at:'2022-03-08T01:01:50.142Z',updated_at:'2026-10-18T12:00:00.000Z',set_by:'apple',response_type:'horny',response_text:'mmph nice',online:true};
const omit=(obj,keys)=>Object.fromEntries(Object.entries(obj).filter(([key])=>!keys.includes(key))),reactionExample=omit(linkExample,['success','post_description']),userExample={type:'user',success:true,watching:true,user:{username:'apple',id:24,set_count:540,is_reporter:false,is_cutie:false,is_supporter:false,online:true,authenticated:true,links:[{...omit(linkExample,['success','set_by','post_description']),username:'apple'}],flair:'',master:false,pets:[],friend:true,self:false}};
return html`



<h2>
  <ion-icon name="build" class="big"></ion-icon>
  Client Guide
</h2>

<p>
  <img src="${v.asset('images/mascot/WarrenAPIExtrodinaire.png')}" alt="Warren making a client with great difficulty" class="mascot float-right" width="240">
  You can make your own Walltaker client! A user should be able to supply any link ID, that you can then use to open a websocket to that instance. The server sends the current wallpaper when the
  subscription opens, then sends a new wallpaper whenever the link changes.
</p>

<br>

<p>
  Older polling clients still work <strong>for now.</strong>
</p>
<p>
  HTTP polling is now
  <a href="/help/deprecated_client_guide">deprecated</a>.
</p>
<br>

<hr>

<h5><code>Connect To A Link</code></h5>

<p>
  Open a WebSocket connection to Walltaker at <code>${v.baseUrl.replace(/^http/,'ws')+'/cable'}</code>, then subscribe to
  <code>LinkChannel</code>. Supply the user's link ID as <code>link_id</code> (or <code>id</code>). Both numeric and custom link IDs are accepted.
</p>

<p>
  You can also pass a client identifier during subscription, however this will only appear if a site admin adds your client to the list.
</p>

<div class="accent-block">
  <div class="accent-block__charm">
    <ion-icon role="presentation" name="code-slash"></ion-icon>
    Subscription
  </div>
  <div class="tabs client-guide-examples" data-controller="tabs">
    <div class="tab" data-tabs-target="tab" data-title="JavaScript">
      <pre><code class="language-javascript">const consumer = ActionCable.createConsumer(
  "${v.baseUrl.replace(/^http/,'ws')+'/cable'}"
);

let currentPostUrl = null;

const subscription = consumer.subscriptions.create(
  {
    channel: "LinkChannel",
    link_id: 1,
    client: "My Walltaker Client/1.0.0"
  },
  {
    received(link) {
      if (!link.success || !link.post_url) return;
      if (link.post_url === currentPostUrl) return;
      currentPostUrl = link.post_url;
      setWallpaper(link.post_url);
    }
  }
);</code></pre>
    </div>

    <div class="tab" data-tabs-target="tab" data-title="Python">
      <pre><code class="language-python">import asyncio
import json
import websockets


def set_wallpaper(url):
    print(f"Set wallpaper to {url}")


async def main():
    current_post_url = None
    identifier = json.dumps({
        "channel": "LinkChannel",
        "link_id": 1,
        "client": "My Walltaker Client/1.0.0",
    })

    async with websockets.connect("${v.baseUrl.replace(/^http/,'ws')+'/cable'}") as socket:
        await socket.send(json.dumps({
            "command": "subscribe",
            "identifier": identifier,
        }))

        async for raw_message in socket:
            envelope = json.loads(raw_message)
            link = envelope.get("message")
            if not link or not link.get("success"):
                continue

            post_url = link.get("post_url")
            if post_url and post_url != current_post_url:
                current_post_url = post_url
                set_wallpaper(post_url)


asyncio.run(main())</code></pre>
    </div>

    <div class="tab" data-tabs-target="tab" data-title="C++">
      <pre><code class="language-cpp">#include &lt;iostream&gt;
#include &lt;string&gt;
#include &lt;nlohmann/json.hpp&gt;
#include &lt;ixwebsocket/IXWebSocket.h&gt;

using json = nlohmann::json;

void set_wallpaper(const std::string& url) {
  std::cout &lt;&lt; "Set wallpaper to " &lt;&lt; url &lt;&lt; std::endl;
}

int main() {
  ix::WebSocket socket;
  std::string current_post_url;
  socket.setUrl("${v.baseUrl.replace(/^http/,'ws')+'/cable'}");

  const auto identifier = json{
    {"channel", "LinkChannel"},
    {"link_id", 1},
    {"client", "My Walltaker Client/1.0.0"}
  }.dump();

  socket.setOnMessageCallback([&](const ix::WebSocketMessagePtr& msg) {
    if (msg-&gt;type == ix::WebSocketMessageType::Open) {
      socket.send(json{
        {"command", "subscribe"},
        {"identifier", identifier}
      }.dump());
      return;
    }

    if (msg-&gt;type != ix::WebSocketMessageType::Message) return;

    auto envelope = json::parse(msg-&gt;str);
    if (!envelope.contains("message")) return;

    auto link = envelope["message"];
    if (!link.value("success", false)) return;
    if (!link.contains("post_url") || !link["post_url"].is_string()) return;

    const auto post_url = link["post_url"].get&lt;std::string&gt;();
    if (post_url.empty() || post_url == current_post_url) return;
    current_post_url = post_url;
    set_wallpaper(post_url);
  });

  socket.start();
  std::cin.get();
  socket.stop();
}</code></pre>
    </div>
  </div>
</div>

<p>
  The JavaScript example uses the Action Cable client. Python and C++ connect directly and read the payload from the
  Action Cable envelope's <code>message</code> field; ignore control frames such as welcomes, pings, and subscription confirmations.
  The <code>setWallpaper</code>/<code>set_wallpaper</code> function is where your client downloads and applies the wallpaper.
</p>

<p>
  Native clients may also identify themselves with WebSocket handshake headers such as <code>User-Agent</code>,
  <code>joihow</code>, <code>User_Agent</code>, or <code>Wallpaper-Engine-Client</code>. Browser WebSocket clients
  usually cannot set custom handshake headers, so use subscription params or <code>announce_client</code>.
</p>

<div class="accent-block">
  <div class="accent-block__charm">
    <ion-icon role="presentation" name="megaphone"></ion-icon>
    Announce Client
  </div>
  <pre><code class="language-javascript">subscription.perform("announce_client", {
  client: "My Walltaker Client/1.0.0"
});</code></pre>
</div>

<hr>

<h5><code>Link Updates</code></h5>

<p>
  The server sends this payload immediately after subscribing and every time client-visible link state changes. Treat
  <code>post_url</code> as the current wallpaper URL. If that request is rejected by the e621 CDN, clients can retry
  with <code>post_url_backup</code>, a Walltaker-hosted URL that supplies the CDN's required request headers. The backup
  is <code>null</code> when the primary URL is not a supported e621 media URL. The token below is a placeholder;
  use the complete backup URL received from the server. Users can enable videos and GIFs on some links, so clients
  should handle file types they cannot display. <code>post_url</code> can also be <code>null</code> if no wallpaper is set.
</p>

<div class="accent-block">
  <div class="accent-block__charm">
    <ion-icon role="presentation" name="arrow-down-circle"></ion-icon>
    Message
  </div>
  <pre><code class="language-json" data-example="link-update">${JSON.stringify(linkExample,null,2)}</code></pre>
</div>

<p>
  Link updates always include the fields above. <code>set_by</code> is a username or <code>null</code>;
  <code>response_type</code> and <code>response_text</code> may be <code>null</code> before a reaction is sent.
  <code>post_description</code> is the full description in WebSocket updates. Presence and reaction changes also trigger
  updates, so download the wallpaper only when <code>post_url</code> changes.
</p>

<p>
  If the link does not exist, the channel sends an error payload and does not stream link updates.
</p>

<div class="accent-block">
  <div class="accent-block__charm">
    <ion-icon role="presentation" name="warning"></ion-icon>
    Error
  </div>
  <pre><code class="language-json">{
  "success": false,
  "why": "Link 0 does not exist."
}</code></pre>
</div>

<hr>

<h5><code>POST ${v.baseUrl+'/api/links/[id]/response.json'}</code></h5>
<p>Set a response for a given link. There are 4 kinds of responses.</p>
<p>🔑 Requires the link owner's API key. Use the numeric <code>id</code> from the link payload in this endpoint.</p>

<table>
  <thead>
  <tr>
    <th><code>type</code></th>
    <th>Shown In UI as</th>
    <th>Effect</th>
  </tr>
  </thead>
  <tbody>
  <tr>
    <td><code>"horny"</code></td>
    <td>Love it</td>
    <td>User who set wallpaper gets notification, response <code>text</code> displayed on link in webapp</td>
  </tr>
  <tr>
    <td><code>"disgust"</code></td>
    <td>Hate it</td>
    <td>User who set wallpaper gets notification, wallpaper rolled back to previous image</td>
  </tr>
  <tr>
    <td><code>"came"</code></td>
    <td>Came</td>
    <td>User who set wallpaper gets notification, response <code>text</code> displayed on link in webapp</td>
  </tr>
  <tr>
    <td><code>"ok"</code></td>
    <td>Thanks</td>
    <td>User who set wallpaper gets notification, response <code>text</code> displayed on link in webapp</td>
  </tr>

  </tbody>
</table>

<p>⚠️ A <code>disgust</code> response rolls the wallpaper back to the previous image and sends the changed state over the WebSocket.
  If no previous image exists, <code>post_url</code> and <code>post_thumbnail_url</code> become <code>null</code>.</p>

<div class="accent-block">
  <div class="accent-block__charm">
    <ion-icon role="presentation" name="arrow-up-circle"></ion-icon>
    Request
  </div>
  <pre><code class="language-http">POST ${v.baseUrl+'/api/links/1/response.json'} HTTP/1.1
Content-Type: application/json

{
  "api_key": "23unFe3i",
  "type": "horny",
  "text": "mmph nice"
}</code></pre>
</div>

<p>
  A successful request returns HTTP <code>200</code> and the link JSON below. Unlike a WebSocket link update, this response
  has no <code>success</code> field. <code>set_by</code> is omitted when no setter is recorded, and
  <code>post_description</code> is omitted when blank or truncated to 100 characters when present.
  An invalid API key returns <code>403</code>, an invalid reaction type returns <code>400</code>, and a missing link returns
  <code>404</code>; these errors contain a <code>message</code> field.
</p>

<div class="accent-block">
  <div class="accent-block__charm">
    <ion-icon role="presentation" name="arrow-down-circle"></ion-icon>
    Response
  </div>
  <pre><code class="language-json" data-example="reaction-response">${JSON.stringify(reactionExample,null,2)}</code></pre>
</div>

<hr>

<h5><code>Watch User Status</code></h5>
<p>Use this on the existing link websocket to get details about a user, such as if they're online, a friend, or the
  currently authenticated user for a given session. This replaces
  <code>GET ${v.baseUrl+'/api/users/[username].json?api_key=xxxxxxxx'}</code>.</p>
<p>🔓/🔐 API key required for some, but not all data.</p>

<p>ℹ️ The <code>links</code> array contains public, unexpired (or never-expiring) links. Each entry excludes
  <code>success</code> and <code>set_by</code>; <code>post_description</code> is omitted when blank and truncated to 100 characters when present.
  <code>friend</code> and <code>self</code> are included only when an API key or browser session authenticates the viewer.
  The legacy field <code>master</code> contains the owner's username, or <code>false</code> if no owner is set.</p>

<div class="accent-block">
  <div class="accent-block__charm">
    <ion-icon role="presentation" name="arrow-up-circle"></ion-icon>
    Request
  </div>
  <pre><code class="language-javascript">subscription.perform("watch_user", {
  username: "apple",
  api_key: "23unFe3i"
});</code></pre>
</div>

<p>Call <code>watch_user</code> again with a new username when the wallpaper is set by someone else.</p>

<div class="accent-block">
  <div class="accent-block__charm">
    <ion-icon role="presentation" name="arrow-down-circle"></ion-icon>
    Response
  </div>
  <pre><code class="language-json" data-example="user-status">${JSON.stringify(userExample,null,2)}</code></pre>
</div>

<hr>

<h5><code>Migrating Older Clients</code></h5>

<p>
  Replace polling <code>GET /api/links/[id].json</code> with one long-lived <code>LinkChannel</code> subscription.
  The WebSocket message payload intentionally matches the link JSON shape, so most wallpaper update code can keep using
  <code>post_url</code>, <code>post_url_backup</code>, <code>post_thumbnail_url</code>, <code>set_by</code>, and
  <code>updated_at</code>.
</p>

<table>
  <thead>
  <tr>
    <th>Old polling behavior</th>
    <th>WebSocket replacement</th>
  </tr>
  </thead>
  <tbody>
  <tr>
    <td>Poll <code>/api/links/[id].json</code> every 10 seconds</td>
    <td>Subscribe once to <code>LinkChannel</code></td>
  </tr>
  <tr>
    <td>Compare cached <code>post_url</code> or <code>updated_at</code></td>
    <td>Read each successful link payload; download media only when <code>post_url</code> changes</td>
  </tr>
  <tr>
    <td>Send client identity through HTTP headers</td>
    <td>Send <code>client</code> in subscription params or <code>announce_client</code></td>
  </tr>
  <tr>
    <td>Polling keeps the link online</td>
    <td>An open WebSocket keeps the link online; disconnects are removed automatically</td>
  </tr>
  <tr>
    <td>Re-poll after <code>disgust</code> responses</td>
    <td>Wait for the next WebSocket payload after sending the response</td>
  </tr>
  </tbody>
</table>

<script>hljs.highlightAll();</script>
`;}
export function deprecated_client_guide(v){return html`

<h2>
  <ion-icon name="build" class="big"></ion-icon>
  Deprecated Client Guide
</h2>

<p>
  This page documents the older HTTP polling client API. It still exists for compatibility, but new clients should use
  the <a href="/help/client_guide">WebSocket client guide</a>.
</p>

<p>
  <strong>Support for polling clients may be removed in the future.</strong>
</p>

<hr>

<h5><code>GET https://devenv.playctrl.me/api/links/[id].json</code></h5>
<p>Gets the current link status. This is what you could poll every 60 seconds to check if the wallpaper has changed. Use
  <code>post_url</code> as the current wallpaper's URL. This is always an image by default, but users can enable
  videos/gifs on a link, so please handle error checking if you see a file type you can't display.</p>
<p>🔓 No API key required.</p>

<div class="accent-block">
  <div class="accent-block__charm">
    <ion-icon role="img" name="arrow-down-circle" class="md hydrated" aria-label="arrow down circle"><template shadowrootmode="open"><div class="icon-inner"><svg xmlns="http://www.w3.org/2000/svg" class="ionicon s-ion-icon" viewBox="0 0 512 512"><title>Arrow Down Circle</title><path d="M256 464c114.87 0 208-93.13 208-208S370.87 48 256 48 48 141.13 48 256s93.13 208 208 208zm-91.36-212.65a16 16 0 0122.63-.09L240 303.58V170a16 16 0 0132 0v133.58l52.73-52.32A16 16 0 11347.27 274l-80 79.39a16 16 0 01-22.54 0l-80-79.39a16 16 0 01-.09-22.65z"></path></svg></div></template></ion-icon>
    Response
  </div>
  <pre><code class="language-json hljs" data-highlighted="yes"><span class="hljs-punctuation">{</span>
  <span class="hljs-attr">"id"</span><span class="hljs-punctuation">:</span> <span class="hljs-number">1</span><span class="hljs-punctuation">,</span>
  <span class="hljs-attr">"expires"</span><span class="hljs-punctuation">:</span> <span class="hljs-string">"2025-03-05T00:00:00.000Z"</span><span class="hljs-punctuation">,</span>
  <span class="hljs-attr">"username"</span><span class="hljs-punctuation">:</span> <span class="hljs-string">"gray"</span><span class="hljs-punctuation">,</span>
  <span class="hljs-attr">"terms"</span><span class="hljs-punctuation">:</span> <span class="hljs-string">"I'm trying out something new, break this please! :)"</span><span class="hljs-punctuation">,</span>
  <span class="hljs-attr">"blacklist"</span><span class="hljs-punctuation">:</span> <span class="hljs-string">"feet blood"</span><span class="hljs-punctuation">,</span>
  <span class="hljs-attr">"post_url"</span><span class="hljs-punctuation">:</span> <span class="hljs-string">"https://static1.e621.net/data/5d/87/5d87428c4839b0dc7d585b87a25af61a.png"</span><span class="hljs-punctuation">,</span>
  <span class="hljs-attr">"post_thumbnail_url"</span><span class="hljs-punctuation">:</span> <span class="hljs-string">"https://static1.e621.net/data/preview/5d/87/5d87428c4839b0dc7d585b87a25af61a.jpg"</span><span class="hljs-punctuation">,</span>
  <span class="hljs-attr">"post_description"</span><span class="hljs-punctuation">:</span> <span class="hljs-string">""</span><span class="hljs-punctuation">,</span>
  <span class="hljs-attr">"created_at"</span><span class="hljs-punctuation">:</span> <span class="hljs-string">"2022-03-08T01:01:50.142Z"</span><span class="hljs-punctuation">,</span>
  <span class="hljs-attr">"updated_at"</span><span class="hljs-punctuation">:</span> <span class="hljs-string">"2022-03-13T21:39:01.828Z"</span><span class="hljs-punctuation">,</span>
  <span class="hljs-attr">"set_by"</span><span class="hljs-punctuation">:</span> <span class="hljs-string">"name"</span><span class="hljs-punctuation">,</span>
  <span class="hljs-attr">"response_type"</span><span class="hljs-punctuation">:</span> <span class="hljs-string">"horny"</span><span class="hljs-punctuation">,</span>
  <span class="hljs-attr">"response_text"</span><span class="hljs-punctuation">:</span> <span class="hljs-string">"HUFF wow"</span><span class="hljs-punctuation">,</span>
  <span class="hljs-attr">"online"</span><span class="hljs-punctuation">:</span> <span class="hljs-literal"><span class="hljs-keyword">true</span></span>
<span class="hljs-punctuation">}</span></code></pre>
</div>

<hr>

<h5><code>POST https://devenv.playctrl.me/api/links/[id]/response.json</code></h5>
<p>Set a response for a given link. There are 4 kinds of responses.</p>
<p>🔑 Requires user's API Key.</p>

<table>
  <thead>
  <tr>
    <th><code>type</code></th>
    <th>Shown In UI as</th>
    <th>Effect</th>
  </tr>
  </thead>
  <tbody>
  <tr>
    <td><code>"horny"</code></td>
    <td>Love it</td>
    <td>User who set wallpaper gets notification, response <code>text</code> displayed on link in webapp</td>
  </tr>
  <tr>
    <td><code>"disgust"</code></td>
    <td>Hate it</td>
    <td>User who set wallpaper gets notification, wallpaper rolled back to previous image</td>
  </tr>
  <tr>
    <td><code>"came"</code></td>
    <td>Came</td>
    <td>User who set wallpaper gets notification, response <code>text</code> displayed on link in webapp</td>
  </tr>
  <tr>
    <td><code>"ok"</code></td>
    <td>Thanks</td>
    <td>User who set wallpaper gets notification, response <code>text</code> displayed on link in webapp</td>
  </tr>

  </tbody>
</table>

<p>⚠️ I suggest re-pinging the link after sending a "<code>disgust</code>" response, so you can reset the user's
  wallpaper to the previous version as soon as possible.</p>

<div class="accent-block">
  <div class="accent-block__charm">
    <ion-icon role="img" name="arrow-up-circle" class="md hydrated" aria-label="arrow up circle"><template shadowrootmode="open"><div class="icon-inner"><svg xmlns="http://www.w3.org/2000/svg" class="ionicon s-ion-icon" viewBox="0 0 512 512"><title>Arrow Up Circle</title><path d="M256 48C141.13 48 48 141.13 48 256s93.13 208 208 208 208-93.13 208-208S370.87 48 256 48zm91.36 212.65a16 16 0 01-22.63.09L272 208.42V342a16 16 0 01-32 0V208.42l-52.73 52.32A16 16 0 11164.73 238l80-79.39a16 16 0 0122.54 0l80 79.39a16 16 0 01.09 22.65z"></path></svg></div></template></ion-icon>
    Request
  </div>
  <pre><code class="language-http hljs" data-highlighted="yes"><span class="hljs-keyword">POST</span> <span class="hljs-string">https://devenv.playctrl.me/api/links/[id]/response.json</span> <span class="hljs-meta">HTTP/1.1</span>
<span class="hljs-attribute">Content-Type</span><span class="hljs-punctuation">: </span>application/json;
{
  "api_key": "23unFe3i",
  "type": "horny",
  "text": "mmph nice"
}
</code></pre>
</div>

<div class="accent-block">
  <div class="accent-block__charm">
    <ion-icon role="img" name="arrow-down-circle" class="md hydrated" aria-label="arrow down circle"><template shadowrootmode="open"><div class="icon-inner"><svg xmlns="http://www.w3.org/2000/svg" class="ionicon s-ion-icon" viewBox="0 0 512 512"><title>Arrow Down Circle</title><path d="M256 464c114.87 0 208-93.13 208-208S370.87 48 256 48 48 141.13 48 256s93.13 208 208 208zm-91.36-212.65a16 16 0 0122.63-.09L240 303.58V170a16 16 0 0132 0v133.58l52.73-52.32A16 16 0 11347.27 274l-80 79.39a16 16 0 01-22.54 0l-80-79.39a16 16 0 01-.09-22.65z"></path></svg></div></template></ion-icon>
    Response
  </div>
  <pre><code class="language-json hljs" data-highlighted="yes"><span class="hljs-punctuation">{</span>
  <span class="hljs-attr">"id"</span><span class="hljs-punctuation">:</span> <span class="hljs-number">1</span><span class="hljs-punctuation">,</span>
  <span class="hljs-attr">"expires"</span><span class="hljs-punctuation">:</span> <span class="hljs-string">"2025-03-05T00:00:00.000Z"</span><span class="hljs-punctuation">,</span>
  <span class="hljs-attr">"username"</span><span class="hljs-punctuation">:</span> <span class="hljs-string">"gray"</span><span class="hljs-punctuation">,</span>
  <span class="hljs-attr">"terms"</span><span class="hljs-punctuation">:</span> <span class="hljs-string">"I'm trying out something new, break this please! :)"</span><span class="hljs-punctuation">,</span>
  <span class="hljs-attr">"blacklist"</span><span class="hljs-punctuation">:</span> <span class="hljs-string">"feet blood"</span><span class="hljs-punctuation">,</span>
  <span class="hljs-attr">"post_url"</span><span class="hljs-punctuation">:</span> <span class="hljs-string">"https://static1.e621.net/data/5d/87/5d87428c4839b0dc7d585b87a25af61a.png"</span><span class="hljs-punctuation">,</span>
  <span class="hljs-attr">"post_thumbnail_url"</span><span class="hljs-punctuation">:</span> <span class="hljs-string">"https://static1.e621.net/data/preview/5d/87/5d87428c4839b0dc7d585b87a25af61a.jpg"</span><span class="hljs-punctuation">,</span>
  <span class="hljs-attr">"post_description"</span><span class="hljs-punctuation">:</span> <span class="hljs-string">""</span><span class="hljs-punctuation">,</span>
  <span class="hljs-attr">"created_at"</span><span class="hljs-punctuation">:</span> <span class="hljs-string">"2022-03-08T01:01:50.142Z"</span><span class="hljs-punctuation">,</span>
  <span class="hljs-attr">"updated_at"</span><span class="hljs-punctuation">:</span> <span class="hljs-string">"2022-03-13T21:39:01.828Z"</span><span class="hljs-punctuation">,</span>
  <span class="hljs-attr">"set_by"</span><span class="hljs-punctuation">:</span> <span class="hljs-string">"name"</span><span class="hljs-punctuation">,</span>
  <span class="hljs-attr">"response_type"</span><span class="hljs-punctuation">:</span> <span class="hljs-string">"horny"</span><span class="hljs-punctuation">,</span>
  <span class="hljs-attr">"response_text"</span><span class="hljs-punctuation">:</span> <span class="hljs-string">"HUFF wow"</span><span class="hljs-punctuation">,</span>
  <span class="hljs-attr">"online"</span><span class="hljs-punctuation">:</span> <span class="hljs-literal"><span class="hljs-keyword">true</span></span>
<span class="hljs-punctuation">}</span></code></pre>
</div>

<hr>

<h5><code>GET https://devenv.playctrl.me/api/users/[username].json?api_key=xxxxxxxx</code></h5>
<p>Get details about this user's status such as if they're online, a friend, or the currently authenticated user for a
  given session.</p>
<p>🔓/🔐 API key required for some, but not all data.</p>

<p>ℹ️ To ensure this query is processed quickly, <code>set_by</code> has been excluded from the links array.</p>

<div class="accent-block">
  <div class="accent-block__charm">
    <ion-icon role="img" name="arrow-down-circle" class="md hydrated" aria-label="arrow down circle"><template shadowrootmode="open"><div class="icon-inner"><svg xmlns="http://www.w3.org/2000/svg" class="ionicon s-ion-icon" viewBox="0 0 512 512"><title>Arrow Down Circle</title><path d="M256 464c114.87 0 208-93.13 208-208S370.87 48 256 48 48 141.13 48 256s93.13 208 208 208zm-91.36-212.65a16 16 0 0122.63-.09L240 303.58V170a16 16 0 0132 0v133.58l52.73-52.32A16 16 0 11347.27 274l-80 79.39a16 16 0 01-22.54 0l-80-79.39a16 16 0 01-.09-22.65z"></path></svg></div></template></ion-icon>
    Response
  </div>
  <pre><code class="language-json hljs" data-highlighted="yes">
<span class="hljs-punctuation">{</span>
  <span class="hljs-attr">"username"</span><span class="hljs-punctuation">:</span> <span class="hljs-string">"apple"</span><span class="hljs-punctuation">,</span>
  <span class="hljs-attr">"id"</span><span class="hljs-punctuation">:</span> <span class="hljs-number">24</span><span class="hljs-punctuation">,</span>
  <span class="hljs-attr">"set_count"</span><span class="hljs-punctuation">:</span> <span class="hljs-number">540</span><span class="hljs-punctuation">,</span>
  <span class="hljs-attr">"online"</span><span class="hljs-punctuation">:</span> <span class="hljs-literal"><span class="hljs-keyword">true</span></span><span class="hljs-punctuation">,</span>
  <span class="hljs-attr">"links"</span><span class="hljs-punctuation">:</span> <span class="hljs-punctuation">[</span>... see link response ...<span class="hljs-punctuation">]</span><span class="hljs-punctuation">,</span>
  <span class="hljs-attr">"authenticated"</span><span class="hljs-punctuation">:</span> <span class="hljs-literal"><span class="hljs-keyword">true</span></span><span class="hljs-punctuation">,</span>
  <span class="hljs-attr">"friend"</span><span class="hljs-punctuation">:</span> <span class="hljs-literal"><span class="hljs-keyword">true</span></span><span class="hljs-punctuation">,</span>
  <span class="hljs-attr">"self"</span><span class="hljs-punctuation">:</span> <span class="hljs-literal"><span class="hljs-keyword">false</span></span>
<span class="hljs-punctuation">}</span>
</code></pre>
</div>

<script>hljs.highlightAll();</script>
`;}
export const helpPages={'help-index':index,'help-faq':faq,'help-client_guide':client_guide,'help-deprecated_client_guide':deprecated_client_guide};
