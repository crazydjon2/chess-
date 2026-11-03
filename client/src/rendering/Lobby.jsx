import PlayOnlineMenu from './PlayOnlineMenu'
import WaitingRoom from './WaitingRoom'

// Menu (create/join) + waiting-for-opponent screen. Once both seats are
// filled, the HOST presses "Начать" to start the match (draft phase) — no
// character-select step, armies are drafted per round.
// "Как играть" lives only in MainMenu.jsx now, not duplicated here.
export default function Lobby({
  phase, room, busy, errorMsg, onCreate, onJoin, onPlayBot, onLeave, onStart, onExit,
  nickname, onNicknameChange, rooms, roomsLoading,
}) {
  if (phase === 'menu') {
    return (
      <PlayOnlineMenu
        busy={busy}
        errorMsg={errorMsg}
        onCreate={onCreate}
        onPlayBot={onPlayBot}
        onJoin={onJoin}
        onExit={onExit}
        nickname={nickname}
        onNicknameChange={onNicknameChange}
        rooms={rooms}
        roomsLoading={roomsLoading}
      />
    )
  }

  // phase === 'waiting' — room joined, waiting for the second seat to fill
  return <WaitingRoom room={room} errorMsg={errorMsg} onLeave={onLeave} onStart={onStart} />
}
