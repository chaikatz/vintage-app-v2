'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { FILTERS, applyFilterToCanvas, formatDateStamp, generateStoryImage } from '@/lib/filters'

const DEFAULT_BIO = 'Collecting moments, not things'

function isOlderThanOneYear(dateValue) {
  if (!dateValue) return false
  const source = new Date(dateValue)
  const oneYearAgo = new Date()
  oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1)
  return source <= oneYearAgo
}

function createInviteCode() {
  return `VNT-${Math.random().toString(36).slice(2, 6).toUpperCase()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`
}

async function reverseGeocode(latitude, longitude) {
  if (!latitude || !longitude) return null

  try {
    const response = await fetch(`https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${latitude}&lon=${longitude}`)
    if (!response.ok) return null
    const payload = await response.json()
    const city = payload?.address?.city || payload?.address?.town || payload?.address?.village
    const country = payload?.address?.country
    if (city && country) return `${city}, ${country}`
    return country || payload?.display_name || null
  } catch {
    return null
  }
}

function FilteredPhoto({ src, filter, dateStamp, className = '', onClick }) {
  const canvasRef = useRef(null)
  const [processed, setProcessed] = useState(false)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || !src) return

    const context = canvas.getContext('2d')
    const image = new Image()
    image.crossOrigin = 'anonymous'
    setProcessed(false)

    image.onload = () => {
      canvas.width = image.width
      canvas.height = image.height
      context.drawImage(image, 0, 0)
      applyFilterToCanvas(canvas, context, filter, dateStamp)
      setProcessed(true)
    }

    image.src = src
  }, [src, filter, dateStamp])

  return (
    <div onClick={onClick} className={`relative ${className}`}>
      <canvas
        ref={canvasRef}
        className={`w-full h-auto block transition-opacity duration-300 ${processed ? 'opacity-100' : 'opacity-0'}`}
      />
      {!processed && <div className="w-full pb-[100%] bg-gray-200 shimmer" />}
    </div>
  )
}

export default function VintageApp() {
  const [screen, setScreen] = useState('welcome')
  const [user, setUser] = useState(null)
  const [profile, setProfile] = useState(null)
  const [authMode, setAuthMode] = useState('login')
  const [authForm, setAuthForm] = useState({ email: '', password: '', username: '', inviteCode: '' })
  const [authError, setAuthError] = useState('')
  const [notification, setNotification] = useState('')

  const [posts, setPosts] = useState([])
  const [likedPosts, setLikedPosts] = useState(new Set())
  const [commentsByPost, setCommentsByPost] = useState({})
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState([])
  const [followingSet, setFollowingSet] = useState(new Set())
  const [remainingInvites, setRemainingInvites] = useState(0)

  const [uploadStep, setUploadStep] = useState('select')
  const [uploadedFile, setUploadedFile] = useState(null)
  const [uploadedPreview, setUploadedPreview] = useState(null)
  const [selectedFilter, setSelectedFilter] = useState('slimAarons')
  const [uploadCaption, setUploadCaption] = useState('')
  const [photoDate, setPhotoDate] = useState(null)
  const [manualDate, setManualDate] = useState('')
  const [needsManualDate, setNeedsManualDate] = useState(false)
  const [memoryBank, setMemoryBank] = useState([])

  const myPosts = useMemo(() => posts.filter((post) => post.user_id === user?.id), [posts, user?.id])
  const onThisDay = useMemo(() => {
    const now = new Date()
    return memoryBank.filter((item) => {
      const date = new Date(item.photoDate)
      return date.getDate() === now.getDate() && date.getMonth() === now.getMonth()
    })
  }, [memoryBank])

  useEffect(() => {
    const timer = notification ? setTimeout(() => setNotification(''), 3000) : null
    return () => {
      if (timer) clearTimeout(timer)
    }
  }, [notification])

  useEffect(() => {
    async function initSession() {
      const { data: { session } } = await supabase.auth.getSession()
      if (session?.user) {
        setUser(session.user)
        setScreen('feed')
      }
    }

    initSession()

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session?.user) {
        setUser(session.user)
        setScreen('feed')
      } else {
        setUser(null)
        setProfile(null)
        setScreen('welcome')
      }
    })

    return () => subscription.unsubscribe()
  }, [])

  useEffect(() => {
    if (!user) return
    loadProfile()
    loadFollowing()
    loadPosts()
    loadLikes()
    loadRemainingInvites()
  }, [user])

  async function loadRemainingInvites() {
    const { count } = await supabase
      .from('invite_codes')
      .select('id', { count: 'exact', head: true })
      .eq('creator_id', user.id)
      .is('used_by', null)
    setRemainingInvites(count || 0)
  }

  async function loadProfile() {
    const { data } = await supabase.from('profiles').select('*').eq('id', user.id).single()
    setProfile(data)
  }

  async function loadFollowing() {
    const { data } = await supabase.from('follows').select('following_id').eq('follower_id', user.id)
    setFollowingSet(new Set((data || []).map((item) => item.following_id)))
  }

  async function loadLikes() {
    const { data } = await supabase.from('likes').select('post_id').eq('user_id', user.id)
    setLikedPosts(new Set((data || []).map((item) => item.post_id)))
  }

  async function loadPosts() {
    const { data: follows } = await supabase.from('follows').select('following_id').eq('follower_id', user.id)
    const visibleUserIds = [user.id, ...(follows || []).map((item) => item.following_id)]

    const { data: postsData } = await supabase
      .from('posts')
      .select('*')
      .in('user_id', visibleUserIds)
      .order('created_at', { ascending: false })

    const userIds = [...new Set((postsData || []).map((post) => post.user_id))]
    const { data: profileRows } = userIds.length
      ? await supabase.from('profiles').select('id, username, avatar_url, bio').in('id', userIds)
      : { data: [] }

    const merged = (postsData || []).map((post) => ({
      ...post,
      profile: profileRows.find((row) => row.id === post.user_id)
    }))

    setPosts(merged)

    const { data: comments } = await supabase
      .from('comments')
      .select('id, post_id, text, created_at, user_id, profiles (username)')
      .in('post_id', (postsData || []).map((post) => post.id))
      .order('created_at', { ascending: true })

    const grouped = (comments || []).reduce((acc, current) => {
      if (!acc[current.post_id]) acc[current.post_id] = []
      acc[current.post_id].push(current)
      return acc
    }, {})

    setCommentsByPost(grouped)
  }

  async function createStarterInvites(creatorId) {
    const payload = Array.from({ length: 5 }).map(() => ({ code: createInviteCode(), creator_id: creatorId }))
    await supabase.from('invite_codes').insert(payload)
  }

  async function handleAuth() {
    setAuthError('')

    if (authMode === 'signup') {
      const inviteCode = authForm.inviteCode.trim().toUpperCase()
      if (!inviteCode) {
        setAuthError('Invite code is required')
        return
      }

      const { data: invite } = await supabase
        .from('invite_codes')
        .select('*')
        .eq('code', inviteCode)
        .is('used_by', null)
        .single()

      if (!invite) {
        setAuthError('Invalid or already-used invite code')
        return
      }

      const { data, error } = await supabase.auth.signUp({ email: authForm.email, password: authForm.password })
      if (error) {
        setAuthError(error.message)
        return
      }

      await supabase.from('profiles').insert({
        id: data.user.id,
        username: authForm.username || authForm.email.split('@')[0],
        bio: DEFAULT_BIO
      })

      await supabase.from('invite_codes').update({ used_by: data.user.id }).eq('id', invite.id)
      await createStarterInvites(data.user.id)
      setNotification('Welcome to VINTAGE')
      return
    }

    const { error } = await supabase.auth.signInWithPassword({ email: authForm.email, password: authForm.password })
    if (error) setAuthError(error.message)
  }

  async function handlePickMemory(event) {
    const file = event.target.files?.[0]
    if (!file) return

    setUploadedFile(file)
    setUploadedPreview(URL.createObjectURL(file))
    setUploadStep('filter')

    try {
      const exifr = (await import('exifr')).default
      const exif = await exifr.parse(file)
      const parsedDate = exif?.DateTimeOriginal ? new Date(exif.DateTimeOriginal) : null

      if (!parsedDate) {
        setNeedsManualDate(true)
        setPhotoDate(null)
        setNotification('No EXIF date found. Please enter memory date manually.')
        return
      }

      if (!isOlderThanOneYear(parsedDate)) {
        setNotification('This memory needs more time. VINTAGE is for photos at least one year old.')
        setUploadStep('select')
        return
      }

      setNeedsManualDate(false)
      setPhotoDate(parsedDate)
    } catch {
      setNeedsManualDate(true)
      setPhotoDate(null)
    }
  }

  async function importMemoryBank(event) {
    const files = Array.from(event.target.files || [])
    if (!files.length) return

    const exifr = (await import('exifr')).default
    const loaded = await Promise.all(files.map(async (file) => {
      let exif = null
      try {
        exif = await exifr.parse(file)
      } catch {
        exif = null
      }

      const photoDate = exif?.DateTimeOriginal || new Date(file.lastModified)
      const locationName = await reverseGeocode(exif?.latitude, exif?.longitude)

      return {
        id: `${file.name}-${file.lastModified}`,
        objectUrl: URL.createObjectURL(file),
        filename: file.name,
        photoDate,
        locationName
      }
    }))

    setMemoryBank((prev) => [...loaded, ...prev].sort((a, b) => new Date(b.photoDate) - new Date(a.photoDate)))
    setNotification('Memories indexed locally')
  }

  async function handleCreatePost() {
    if (!uploadedFile) return

    const effectiveDate = needsManualDate ? new Date(manualDate) : photoDate
    if (!effectiveDate || Number.isNaN(effectiveDate.getTime())) {
      setNotification('Add a valid memory date')
      return
    }

    if (!isOlderThanOneYear(effectiveDate)) {
      setNotification('This memory needs more time. VINTAGE is for photos at least one year old.')
      return
    }

    const fileName = `${user.id}/${Date.now()}-${uploadedFile.name}`
    const { error: uploadError } = await supabase.storage.from('photos').upload(fileName, uploadedFile)
    if (uploadError) {
      setNotification('Upload failed')
      return
    }

    const { data: { publicUrl } } = supabase.storage.from('photos').getPublicUrl(fileName)

    const { error: postError } = await supabase.from('posts').insert({
      user_id: user.id,
      image_url: publicUrl,
      caption: uploadCaption,
      filter: selectedFilter,
      photo_date: effectiveDate.toISOString(),
      date_stamp: formatDateStamp(effectiveDate)
    })

    if (postError) {
      setNotification('Post failed')
      return
    }

    setUploadStep('select')
    setUploadedFile(null)
    setUploadedPreview(null)
    setUploadCaption('')
    setPhotoDate(null)
    setManualDate('')
    setNeedsManualDate(false)
    setScreen('feed')
    setNotification('Memory posted')
    loadPosts()
  }

  async function handleLike(post) {
    const liked = likedPosts.has(post.id)
    if (liked) {
      await supabase.from('likes').delete().eq('user_id', user.id).eq('post_id', post.id)
      await supabase.from('posts').update({ likes: Math.max((post.likes || 1) - 1, 0) }).eq('id', post.id)
    } else {
      await supabase.from('likes').insert({ user_id: user.id, post_id: post.id })
      await supabase.from('posts').update({ likes: (post.likes || 0) + 1 }).eq('id', post.id)
    }

    await loadLikes()
    await loadPosts()
  }

  async function handleComment(postId, text) {
    if (!text.trim()) return
    await supabase.from('comments').insert({ user_id: user.id, post_id: postId, text: text.trim() })
    loadPosts()
  }

  async function handleSearch() {
    if (!searchQuery.trim()) {
      setSearchResults([])
      return
    }

    const { data } = await supabase
      .from('profiles')
      .select('id, username, bio, avatar_url')
      .ilike('username', `%${searchQuery.trim()}%`)
      .limit(20)

    setSearchResults(data || [])
  }

  async function toggleFollow(targetUserId) {
    if (followingSet.has(targetUserId)) {
      await supabase.from('follows').delete().eq('follower_id', user.id).eq('following_id', targetUserId)
    } else {
      await supabase.from('follows').insert({ follower_id: user.id, following_id: targetUserId })
    }

    loadFollowing()
    loadPosts()
  }

  async function saveProfile() {
    if (!profile?.username?.trim()) {
      setNotification('Username required')
      return
    }

    await supabase
      .from('profiles')
      .update({ username: profile.username.trim(), bio: profile.bio || DEFAULT_BIO })
      .eq('id', user.id)

    setNotification('Profile updated')
  }

  async function exportStory(post) {
    setNotification('Preparing story export...')
    generateStoryImage(post.image_url, post.filter, post.date_stamp, (blob) => {
      const url = URL.createObjectURL(blob)
      const anchor = document.createElement('a')
      anchor.href = url
      anchor.download = `vintage-story-${post.date_stamp}.png`
      anchor.click()
      URL.revokeObjectURL(url)
      setNotification('Story image saved')
    })
  }

  return (
    <div className="min-h-screen pb-24">
      {notification && <div className="fixed top-4 left-1/2 -translate-x-1/2 z-[100] bg-vintage-charcoal text-white px-4 py-2 rounded">{notification}</div>}

      {screen === 'welcome' && (
        <section className="min-h-screen flex flex-col justify-center max-w-md mx-auto px-8 text-center fade-in">
          <h1 className="text-5xl tracking-[7px] mb-4">VINTAGE</h1>
          <p className="italic text-vintage-muted mb-2">The future is retro.</p>
          <p className="italic text-vintage-muted mb-8">A museum for your memories</p>
          <div className="space-y-3">
            {authMode === 'signup' && (
              <>
                <input className="w-full p-3 border rounded bg-white" placeholder="Username" value={authForm.username} onChange={(event) => setAuthForm({ ...authForm, username: event.target.value })} />
                <input className="w-full p-3 border rounded bg-white uppercase" placeholder="Invite code" value={authForm.inviteCode} onChange={(event) => setAuthForm({ ...authForm, inviteCode: event.target.value })} />
              </>
            )}
            <input className="w-full p-3 border rounded bg-white" type="email" placeholder="Email" value={authForm.email} onChange={(event) => setAuthForm({ ...authForm, email: event.target.value })} />
            <input className="w-full p-3 border rounded bg-white" type="password" placeholder="Password" value={authForm.password} onChange={(event) => setAuthForm({ ...authForm, password: event.target.value })} />
            {authError && <p className="text-sm text-red-600">{authError}</p>}
            <button onClick={handleAuth} className="w-full p-3 bg-vintage-charcoal text-white tracking-[2px]">{authMode === 'login' ? 'ENTER MUSEUM' : 'CREATE ACCOUNT'}</button>
            <button className="underline text-sm" onClick={() => setAuthMode(authMode === 'login' ? 'signup' : 'login')}>{authMode === 'login' ? 'Need an invite?' : 'Already have an account?'}</button>
          </div>
        </section>
      )}

      {user && screen !== 'welcome' && (
        <>
          <header className="sticky top-0 bg-vintage-cream border-b p-4 z-30">
            <div className="max-w-xl mx-auto flex justify-between items-center">
              <h2 className="tracking-[4px] text-xl">VINTAGE</h2>
              <button className="text-sm underline" onClick={loadPosts}>Refresh</button>
            </div>
          </header>

          <main className="max-w-xl mx-auto p-4 fade-in">
            {screen === 'feed' && (
              <div className="space-y-5">
                {posts.length === 0 && <p className="text-vintage-muted text-center py-16">Follow friends to fill your museum feed.</p>}
                {posts.map((post) => (
                  <article key={post.id} className="bg-white p-3 rounded-lg shadow-sm">
                    <div className="flex items-center justify-between mb-2">
                      <div>
                        <p className="font-semibold">{post.profile?.username || 'anonymous'}</p>
                        <p className="text-xs text-vintage-muted">{new Date(post.created_at).toLocaleDateString()}</p>
                      </div>
                      <button className="text-xs underline" onClick={() => exportStory(post)}>Story export</button>
                    </div>
                    <FilteredPhoto src={post.image_url} filter={post.filter} dateStamp={post.date_stamp} className="rounded overflow-hidden" />
                    <div className="flex items-center justify-between mt-2">
                      <button onClick={() => handleLike(post)}>{likedPosts.has(post.id) ? '♥' : '♡'} {post.likes || 0}</button>
                    </div>
                    <p className="mt-2"><span className="font-semibold mr-2">{post.profile?.username}</span>{post.caption}</p>
                    <Comments comments={commentsByPost[post.id] || []} onSubmit={(text) => handleComment(post.id, text)} />
                  </article>
                ))}
              </div>
            )}

            {screen === 'upload' && (
              <section className="space-y-4">
                <h3 className="text-xl">Add memory</h3>
                {uploadStep === 'select' && (
                  <label className="block border-2 border-dashed rounded-lg p-10 text-center bg-white cursor-pointer">
                    <input type="file" accept="image/*" onChange={handlePickMemory} className="hidden" />
                    Select a photo at least one year old
                  </label>
                )}

                {uploadStep === 'filter' && uploadedPreview && (
                  <>
                    <FilteredPhoto src={uploadedPreview} filter={selectedFilter} dateStamp={formatDateStamp(photoDate || manualDate || new Date())} className="rounded overflow-hidden" />
                    <div className="flex gap-2 overflow-x-auto no-scrollbar">
                      {Object.entries(FILTERS).map(([key, filter]) => (
                        <button key={key} className={`px-3 py-2 rounded text-sm ${selectedFilter === key ? 'bg-vintage-charcoal text-white' : 'bg-white border'}`} onClick={() => setSelectedFilter(key)}>{filter.name}</button>
                      ))}
                    </div>
                    {needsManualDate && (
                      <input type="date" className="w-full p-3 border rounded bg-white" value={manualDate} onChange={(event) => setManualDate(event.target.value)} />
                    )}
                    <input value={uploadCaption} onChange={(event) => setUploadCaption(event.target.value)} className="w-full p-3 border rounded bg-white" placeholder="Location, year..." />
                    <button className="w-full p-3 bg-vintage-charcoal text-white" onClick={handleCreatePost}>Post memory</button>
                  </>
                )}

                <div className="bg-white p-4 rounded-lg border">
                  <h4 className="font-semibold mb-2">Memories browser</h4>
                  <label className="inline-block text-sm underline cursor-pointer mb-4">
                    Index local photos
                    <input type="file" multiple accept="image/*" onChange={importMemoryBank} className="hidden" />
                  </label>
                  <p className="text-sm text-vintage-muted mb-2">On this day</p>
                  <div className="grid grid-cols-3 gap-2 mb-4">
                    {onThisDay.slice(0, 6).map((item) => (
                      <img key={item.id} src={item.objectUrl} alt={item.filename} className="w-full aspect-square object-cover rounded" />
                    ))}
                  </div>
                  <p className="text-sm text-vintage-muted mb-2">Timeline</p>
                  <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
                    {memoryBank.map((item) => (
                      <div key={item.id} className="flex gap-3 items-center">
                        <img src={item.objectUrl} alt={item.filename} className="w-12 h-12 rounded object-cover" />
                        <div>
                          <p className="text-sm">{new Date(item.photoDate).toLocaleDateString()} {item.locationName ? `— ${item.locationName}` : ''}</p>
                          <p className="text-xs text-vintage-muted">{item.filename}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </section>
            )}

            {screen === 'search' && (
              <section>
                <div className="flex gap-2 mb-3">
                  <input className="flex-1 p-3 border rounded bg-white" placeholder="Search usernames" value={searchQuery} onChange={(event) => setSearchQuery(event.target.value)} />
                  <button className="px-4 bg-vintage-charcoal text-white rounded" onClick={handleSearch}>Go</button>
                </div>
                <div className="space-y-3">
                  {searchResults.map((result) => (
                    <div key={result.id} className="bg-white p-3 rounded flex justify-between items-center">
                      <div>
                        <p className="font-semibold">{result.username}</p>
                        <p className="text-sm text-vintage-muted">{result.bio || DEFAULT_BIO}</p>
                      </div>
                      {result.id !== user.id && (
                        <button className="text-sm underline" onClick={() => toggleFollow(result.id)}>{followingSet.has(result.id) ? 'Unfollow' : 'Follow'}</button>
                      )}
                    </div>
                  ))}
                </div>
              </section>
            )}

            {screen === 'profile' && profile && (
              <section className="space-y-4">
                <h3 className="text-xl">Profile</h3>
                <div className="bg-white p-4 rounded-lg space-y-2">
                  <input className="w-full p-2 border rounded" value={profile.username || ''} onChange={(event) => setProfile({ ...profile, username: event.target.value })} />
                  <textarea className="w-full p-2 border rounded" rows={3} value={profile.bio || ''} onChange={(event) => setProfile({ ...profile, bio: event.target.value })} />
                  <button className="text-sm underline" onClick={saveProfile}>Save profile</button>
                </div>
                <div className="grid grid-cols-4 text-center bg-white rounded p-3">
                  <Stat label="Posts" value={myPosts.length} />
                  <Stat label="Followers" value={0} />
                  <Stat label="Following" value={followingSet.size} />
                  <Stat label="Invites" value={remainingInvites} />
                </div>
                <div className="grid grid-cols-3 gap-1">
                  {myPosts.map((post) => (
                    <FilteredPhoto key={post.id} src={post.image_url} filter={post.filter} dateStamp={post.date_stamp} className="aspect-square overflow-hidden" />
                  ))}
                </div>
                <button className="underline text-sm" onClick={() => supabase.auth.signOut()}>Log out</button>
              </section>
            )}
          </main>

          <nav className="fixed bottom-0 left-0 right-0 border-t bg-vintage-cream">
            <div className="max-w-xl mx-auto grid grid-cols-4 text-center text-sm">
              <button className="p-4" onClick={() => setScreen('feed')}>Feed</button>
              <button className="p-4" onClick={() => setScreen('search')}>Search</button>
              <button className="p-4" onClick={() => setScreen('upload')}>Upload</button>
              <button className="p-4" onClick={() => setScreen('profile')}>Profile</button>
            </div>
          </nav>
        </>
      )}
    </div>
  )
}

function Stat({ label, value }) {
  return (
    <div>
      <p className="text-lg font-semibold">{value}</p>
      <p className="text-xs text-vintage-muted uppercase">{label}</p>
    </div>
  )
}

function Comments({ comments, onSubmit }) {
  const [text, setText] = useState('')

  return (
    <div className="mt-3 pt-2 border-t">
      <div className="space-y-1 mb-2">
        {comments.slice(-3).map((comment) => (
          <p key={comment.id} className="text-sm"><span className="font-semibold mr-1">{comment.profiles?.username || 'user'}</span>{comment.text}</p>
        ))}
      </div>
      <div className="flex gap-2">
        <input
          className="flex-1 border rounded px-2 py-1 text-sm"
          placeholder="Write a comment"
          value={text}
          onChange={(event) => setText(event.target.value)}
        />
        <button
          className="text-sm underline"
          onClick={() => {
            onSubmit(text)
            setText('')
          }}
        >
          Post
        </button>
      </div>
    </div>
  )
}
