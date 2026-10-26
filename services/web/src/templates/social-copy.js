import {html} from './html.js';

export const leashWarning=html`<div class="accent-block accent-block--warning spaced">
    <iconify-icon icon="mdi:dog-side" class="scare-charm"></iconify-icon>
    <div class="accent-block__charm">
      <ion-icon role="presentation" name="warning"></ion-icon>
      Your failure to read this is not a bug.
    </div>
    <p>
      A leash is an upgrade you can apply to any confirmed friendship. It's an owner/pet relationship, so
      be careful! <u>There are some things you should know before leashing yourself.</u>
    </p>

    <ul>
      <li>A leash can only be created by the pet.</li>
      <li>A pet can only have <u>ONE</u> direct owner.</li>
      <li>An owner can have multiple pets.</li>
      <li>A pet <u>CANNOT REVOKE</u> a leash. It <u>must</u> be removed by the owner.</li>
    </ul>

    <!-- maybe later
    <h4>Packs</h4>

    <ul>
      <li>A pet can be an owner for another user. This forms a chain of leashes.</li>
      <li>If your owner is a pet for someone else, <u>you are part of a pack.</u></li>
      <li>Pack privileges lead upwards, <u>your owner's owner is your owner.</u></li>
      <li>
        Your position in the pack is determined by the distance to the first non-leashed owner.
        <ul>
          <li>α Alpha = First Pet</li>
          <li>β Beta = Second Pet</li>
          <li>Ω Omega = Third Pet or deeper</li>
        </ul>
      </li>
      <li>Packs are automatically included in a message thread.</li>
    </ul>
    -->

    <h4>What can owners do?</h4>

    <ul>
      <li>
        Owners <u>DO NOT</u> get surrender access.<br>
        <em>If you surrender to your owner, nothing is different from a regular surrender.</em><br>
        <a href="/surrenders">Read more about surrenders</a>
      </li>
      <li>Owners can add a label to your profile that will be shown publicly.
        You will still have control of your profile, but this one segment will be uneditable. Only your owner can
        change
        change/remove it.
      </li>
      <li>Owners will have a public list of their pets on their profile, featuring your name.</li>
      <li>Owners can lock any of your links to "Pack Property", meaning only they can set
        wallpapers for it. (You cannot.)
      </li>
    </ul>
  </div>`;
export const surrenderWarning=html`<div class="accent-block accent-block--warning spaced">
  <ion-icon role="presentation" name="skull" class="scare-charm"></ion-icon>
  <div class="accent-block__charm">
    <ion-icon role="presentation" name="warning"></ion-icon>
    Your failure to read this is not a bug.
  </div>
  <p>
    This tool instead allows you to give <strong>full</strong> access to your account to any friend. You do not need to
    share your password. <strong>They will <em>not</em> see your email address, or login credentials.</strong> (not even
    walltaker can know what your plain-text password is in-fact!)
  </p>
  <br>
  <p class="important">
    A walltaker moderator will <strong>NEVER</strong> ask you to use this tool.
  </p>
  <br>
  <p>
    Full access, means <strong>full access.</strong> This is giving up your account to someone temporarily! You are able
    to abort during the time period when the other user has access to your account, but there is no easy undo option for
    things they would've already done.
  </p>
  <br>

  <strong>They can</strong>

  <ul>
    <li>chat,</li>
    <li>make links,</li>
    <li>send wallpapers to others,</li>
    <li>change your profile and link settings,</li>
    <li>delete or add friends,</li>
    <li>and otherwise, use and abuse your account <strong>appearing as you.</strong>
    </li>
  </ul>

  <strong>They cannot</strong>

  <ul>
    <li>see your password,</li>
    <li>see your email address.</li>
    <li>That's literally it. Have I made it clear yet? They can do a lot.</li>
  </ul>
</div>`;
